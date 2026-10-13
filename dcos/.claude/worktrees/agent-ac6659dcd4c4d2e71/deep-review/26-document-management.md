# Deep Review 26 — Document Management Module

**Reviewer**: Senior Enterprise Platform Architect
**Date**: 2026-05-26
**Verdict**: NOT FIT FOR PURPOSE — A SURFACE-LEVEL DOCUMENT VIEWER PRETENDING TO BE A DMS

---

## A. Executive Summary

The Document Management module is the single most consequential failure surface in the entire RAN platform after the missing Real Estate / Lease module. Telecom rollouts live and die by paper trails — lease agreements, building permits, tower studies, FAA filings, radio licenses, ATPs, as-builts, RFDS, BOMs, insurance certificates, vendor SOWs, MSAs, change orders, regulatory submissions to FCC/Ofcom/TRAI/ANATEL. Every one of these has a legal half-life of 5–30 years and must be defensible in litigation, audit, and regulatory inspection. What ships here is a **dashboard, a list view, a missing-doc heatmap, and a per-site tab** — collectively a thin presentation layer over a hypothetical DMS backend (the code repeatedly hard-codes `https://dms.internal/documents/${id}` as a "real" DMS link).

There is **no actual content store**, **no version control object model**, **no checksum / hash validation**, **no MIME-type validation**, **no virus scan integration**, **no retention policy engine**, **no legal hold**, **no e-signature integration**, **no OCR**, **no full-text search index**, **no document templates auto-generated from site data**, **no approval workflow state machine**, and **no integration adapter for SharePoint / M365 / Box / Documentum / OpenText**. Every "download" in the code does a `new Blob([…text…])` and synthesizes a placeholder text file. This is theater, not document management.

The only redeemable element is the **traffic-light Missing Document matrix** in `DocumentMissingReport.tsx` — a genuinely useful UX pattern that program managers will love. Everything else needs to be torn down and rebuilt against a real DMS substrate (Documentum, SharePoint Online, M-Files, Box Enterprise, or a custom S3+OpenSearch+Postgres stack).

---

## B. File-by-File Findings

### B.1 `DocumentDashboard.tsx` (446 lines)
- Hard-coded `useSiteData()` returns 8 mock sites with synthetic phase percentages. No connection to the rest of the application's site catalog (no shared `getSite()` lookup), so the dashboard's "Alpha Tower North" is **untethered** from any real Site Lifecycle record.
- KPIs ("Fully Documented", "Sites At Risk", "Critical Sites", "Program Completeness") compute on this throwaway mock — Program Manager can't drill from the KPI to actual missing documents.
- Heatmap cells open a `CellDetailDrawer` that generates **5 fake documents per cell** with `id: ${site}_${phase}_${i}` and a categorical name pulled from a 5-item array (`'RF Design Sheet', 'Tower Structure Study', 'Frequency Assignment', 'Antenna Config', 'Coverage Map'`). The categories don't match the phase — clicking on Site Acquisition cells will show "Frequency Assignment" and "Antenna Config" which belong to RF Design. Logical incoherence.
- Download produces a 100-byte placeholder text blob with metadata. Calling this a "Download" in front of an auditor is misrepresentation.
- No date range filter. No region drill. No vendor view. No "by document type" view. No "expiring permits" widget. No "documents missing for go-live" filter.
- Scope filter is a non-op — it's read into state but never applied to filtering.

### B.2 `DocumentListPage.tsx` (716 lines)
- Hard-coded 15-document mock dataset. No pagination beyond client-side. No server-side search.
- `STALE_DOCS` is a manually-curated mock list — disconnected from the actual document data. If you re-upload one of the stale docs, the alert panel still shows it.
- "Pending Approvals" KPI uses a hand-coded "Required docs missing" value of **23** — pure mock. Not computed.
- "Avg Completeness" KPI uses a hand-coded **61** — pure mock.
- Export-to-CSV builds a CSV client-side. For 100,000 documents this would freeze the browser. No server-paginated export.
- Upload modal accepts site / category / phase metadata but **only as `<Input>` strings** — no validation against the actual site catalog. Free-text "SITE-NYC-001" will be accepted whether the site exists or not.
- File extension whitelist is hard-coded (`.pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.dwg,.zip,.csv`) — no `.tif`, `.tiff` (the scanner format for legacy permits), no `.kmz`/`.kml` (for path surveys), no `.dgn` (MicroStation drawings), no `.xer` (Primavera schedules).
- "Open in DMS" links to a hard-coded `https://dms.internal/documents/${rec.id}` — this URL doesn't resolve to anything real, will 404 in production unless the org happens to run an internal DMS at that exact host. This is technical debt baked into the UI.
- Preview modal is a `<FileTextOutlined />` icon next to "Preview placeholder — open the file in DMS or download to view full content". For a billion-dollar rollout platform shipping in 2026, **inability to preview a PDF in-browser** is unacceptable. PDF.js, ViewerJS, Office 365 embedded viewers are all free.

### B.3 `DocumentMissingReport.tsx` (468 lines)
- The best file in the module. The traffic-light grid (Site × Required Document Type, color-coded green/amber/red/grey) is **genuinely product-grade** and aligns with how telecom PMOs actually track docs.
- 14 document types hard-coded in `DOC_TYPE_COLUMNS` — but these are **operator-specific** and should be configurable per tenant (Verizon has different required docs than Vodafone India or Telefónica Brazil). No per-tenant config.
- Quick Upload from a missing cell jumps straight to a `QuickUploadDialog` — good UX, but the upload is a 800ms setTimeout fake; no actual file is stored.
- Phase grouping shows column-group headers (Site Acquisition, RF Design, etc.) — but the alignment is off when the table scrolls horizontally because the group header div is rendered outside the AntD Table. Visual bug.
- Export to CSV and Excel are both `text/csv` and `application/vnd.ms-excel` blobs of TSV data (not real XLSX). Calling the second "Excel" is misleading — older Excel versions will reject it, and modern Excel shows a "format / extension mismatch" warning. Use a real XLSX library (`xlsx`, `exceljs`).
- "Summary cell" in column footer renders custom counts but the % calc on row 296 divides by `filteredCols.filter(c => rec.cells[c.key] !== 'na').length` — if all cells are N/A, this returns 0 and produces `NaN%`. Defensive null check needed.

### B.4 `SiteDocumentsTab.tsx` (1228 lines — by far the largest)
- This is **the closest thing to a real DMS UI** in the codebase. It has 4 tabs (All Docs, Photos, Checklist, Approvals), inline document viewer drawer with version dropdown, page navigation, zoom, PDF/image rendering placeholders, bulk upload drawer with filename → category auto-detection regex.
- Auto-detect regex on filename (`/RFDS/i`, `/TSS/i`, `/BOM/i`) is **fragile** — depends on operator filename conventions which vary by vendor. Better approach: tag-on-upload with a Required field for category.
- Photo tab is **siloed from the rest of the photo data model**. Photos have `geotagged`, `geoLat`, `geoLng`, `distanceFromSite` — these are duplicated from what should be a single GIS layer. No comparison to site coordinates from the Site Lifecycle Management module.
- "Approval chain" UI in viewer drawer (line 372–381) shows 3 fake steps (Submitted → Under Review → Approved). Real telecom approval chains have 5–7 steps including legal review, regulatory check, RF lead sign-off, executive approval for capex over threshold. State-machine modeling missing.
- Inline PDF viewer is a `<FilePdfOutlined />` icon over a repeating-linear-gradient background simulating page lines. **No actual PDF rendering**. Page navigation buttons (`page < totalPages`) update a state variable that visually displays "Page 1 of 8" but nothing changes. This is a **fake viewer**.
- Bulk upload table allows per-row scope/phase/category but doesn't enforce minimum scope coverage (e.g. RF Design must have at least RFDS + Coverage Map). No bulk validation.

---

## C. Missing — Document Version Control

There is **no version model**. The data type has `version: string` ("v2.1") but no:
- **Major / Minor / Patch semantics** — what triggers a new major version (regulatory resubmit, scope change) vs minor (typo fix)?
- **Diff view** — what changed between v1.0 and v2.1 of the RFDS? Two PDFs side-by-side? Redline doc? No.
- **Version-aware approval chain** — does approving v1.0 auto-supersede v0.9? Or does v0.9 stay live until v1.0 is approved?
- **Branch management** — what if two engineers are editing v2.1 in parallel? Lock model? Merge model? None defined.
- **Effective date** — when does v2.1 become the "current" version? On approval? On publish? On a future date for regulatory effective-date alignment?
- **Sunset / supersede** — when v2.1 supersedes v2.0, can v2.0 still be opened for historical reference? Audit trail?
- **Frozen baseline** — for ATP / commissioning, you typically freeze a baseline document set. No baseline concept.

In real DMS systems (Documentum, OpenText, M-Files), version control is a **first-class object** with check-in/check-out, version-on-save, version comments, and version delta storage (often differential). The platform stores `version: string` as a label. This is unusable for legal defense.

---

## D. Missing — Approval / Review Workflow

The code shows 5 statuses (`APPROVED | IN_REVIEW | PENDING | REJECTED | DRAFT`) but **no state machine** binds them:
- No "submit for review" action — uploading goes directly to PENDING.
- No "request changes" — only Approve and Reject are visible.
- No reviewer assignment — Reviewer is a free-text name on the document.
- No multi-step approval routing — telecom permits often need legal → regulatory → operations → executive in sequence; here it's a single state.
- No delegation (PTO coverage) — if the reviewer is on leave, document sits.
- No SLA timer beyond a passive "days pending" counter — no escalation to manager, no auto-reassign.
- No parallel approval lanes — some docs need simultaneous safety+RF+legal sign-off; no AND/OR gate modeling.
- No reviewer comments on rejection beyond a single text field.

**Comparable**: Documentum Approval Workflow, M-Files Workflows, SharePoint Power Automate flows, Box Workflow, Adobe Acrobat Sign workflow. All have visual state machine designers. This platform has none.

---

## E. Missing — Document Templates (Auto-Generated)

In real telecom rollouts, the platform should **auto-generate**:
- **Lease Agreements** from a master MSA + site-specific Schedule A (parcel address, rent escalator, term, GPS coords).
- **Building Permit applications** pre-filled from site metadata, structural data, owner info.
- **FCC / Ofcom / regulatory filings** auto-populated from the technical site characteristics (antenna height AGL, EIRP, frequency bands, polarization, beamwidth, downtilt).
- **RFDS / Design Sheets** pre-generated from RF planning tool exports (Atoll, Asset, EDX, Mentum Planet).
- **ATP / Commissioning Test scripts** from the checklist library.
- **As-built drawing stub** with the site location pre-stamped.
- **Method of Procedure (MOP)** templates per scope.

The platform has **none of this**. Upload is purely manual. No mail-merge. No data-binding. Massive opportunity loss for productivity — typical operator wastes 4–8 hours per site filling out templates manually.

---

## F. Missing — Retention Policies & Legal Hold

For telecom regulatory compliance (FCC 47 CFR §17.49 for tower records, GDPR Article 17 for personal data in lease docs, SOX for capex-related docs):
- No **retention period** field per document category. Building permits typically 30 years. Insurance certs 7 years. Lease agreements 10 years post-termination.
- No **expiry alerts** — Building Permit expires in 6 months → who gets notified? Code has nothing.
- No **legal hold** — once litigation is anticipated, all related documents must be frozen. No "hold" flag, no override of retention deletion, no e-discovery package generation.
- No **data residency** controls — EU operator GDPR-protected documents must stay in EU region. No region-binding.
- No **classification** — Public / Internal / Confidential / Restricted. The `restricted: boolean` flag is a binary surrogate that's enforced only in the UI (`disabled={rec.restricted}`) — easily bypassed by anyone with API access.

**Comparable**: Documentum Records Manager, OpenText Records Management, Microsoft Purview, Veritas Enterprise Vault. All are mature, certified products that integrate with DMS.

---

## G. Missing — Regulatory Submission Tracking

The most legally-fraught document type in the rollout — **regulatory submissions to FCC / Ofcom / TRAI / ANATEL / etc.** — has zero special handling:
- No **submission portal integration** (FCC ULS, ATCB filings, OEM type-acceptance lookups).
- No **acknowledgment tracking** — when FCC issues a receipt #, where is it stored? No field.
- No **deadline tracking** — many regulatory filings have hard deadlines (e.g., 30 days post-build for FAA notification of antenna height changes).
- No **multi-jurisdiction template management** — same site near a state border may need filings to both state and FAA; the platform should manage this matrix.
- No **electronic signature** to regulatory bodies (FCC requires officer attestation).
- No **status sync** — FCC application going through Bureau Review, License Issued, License Modified, License Cancelled — none of this state is reflected back into the platform.

---

## H. Missing Integrations

- **SharePoint / M365**: No Microsoft Graph API connector, no SharePoint document library mirror, no Teams integration for collaboration on documents.
- **Box / Dropbox Business**: No webhook receiver for new uploads in shared folders, no metadata sync.
- **Documentum / OpenText**: No CMIS adapter, no DCTM connector.
- **DocuSign / Adobe Sign**: No e-signature integration. Lease agreements, MSAs, change orders, ATPs are usually signed via DocuSign / Adobe Sign — the platform should orchestrate signing envelopes and bring signed PDFs back in.
- **OCR (ABBYY, AWS Textract, Azure Form Recognizer)**: No OCR pipeline. Scanned permits sit as image PDFs that are not full-text searchable. Field engineers photograph paper documents on-site that never become searchable.
- **AI / LLM extraction**: No ability to extract structured data from documents (e.g., "expiry date from building permit", "lease end date from contract") — basic 2026-era capability.
- **CAD viewing**: `.dwg` and `.dxf` files are stored but not viewable. Real platform should integrate with Autodesk Viewer or ShareCAD.
- **Email-in**: No `documents@platform.com` email-to-document drop pattern. Mature DMS systems all accept email attachments routed to specific projects/sites.

---

## I. Information Architecture, UX, Performance Issues

- **Three list views, no clear "primary" surface**: Dashboard (heatmap), List (table), Missing Report (matrix). User journey unclear — which one to land on as a Document Manager?
- **No global search across documents** with type-ahead, faceted filters, and OCR'd content. AntD `Input.Search` is client-side substring match on filename.
- **Performance**: With 100k+ documents (realistic for a 5k-site rollout), client-side filter+sort on `allDocs` will be sluggish; AntD Table virtualization is not used.
- **No bulk operations**: No "mark 20 docs as approved", no "reassign reviewer in bulk", no "delete drafts older than 90 days", no "tag a batch with project code".
- **No favoriting / pinning** important documents.
- **No "recently viewed"** by user.
- **No notifications integration** — uploading a document doesn't trigger a notification to the assigned reviewer.

---

## J. Benchmarking vs Commercial DMS

| Capability                         | This Platform | SharePoint | M365     | Box Enterprise | Dropbox Biz | Documentum | OpenText |
|------------------------------------|:-------------:|:----------:|:--------:|:--------------:|:-----------:|:----------:|:--------:|
| In-browser PDF/Office viewer       | ✗             | ✓          | ✓        | ✓              | ✓           | ✓          | ✓        |
| Version control with check-in/out  | ✗             | ✓          | ✓        | ✓              | ✓           | ✓          | ✓        |
| Approval workflow engine           | ✗             | ✓ (PA)     | ✓        | ✓              | △           | ✓✓         | ✓✓       |
| E-signature integration            | ✗             | ✓          | ✓        | ✓              | ✓           | ✓          | ✓        |
| OCR + full-text search             | ✗             | ✓          | ✓        | ✓              | ✓           | ✓          | ✓        |
| Retention / records management     | ✗             | ✓          | ✓        | ✓              | △           | ✓✓         | ✓✓       |
| Legal hold                         | ✗             | ✓          | ✓        | ✓              | △           | ✓✓         | ✓✓       |
| Metadata templates                 | ✗             | ✓          | ✓        | ✓              | △           | ✓          | ✓        |
| Audit log per document             | △ (global)    | ✓          | ✓        | ✓              | ✓           | ✓          | ✓        |
| CAD / 3D viewing                   | ✗             | △          | △        | ✓              | △           | ✓          | ✓        |
| AI document extraction             | ✗             | ✓          | ✓ (Syntex)| ✓ (Skills)    | △           | ✓          | ✓        |
| Email-in                           | ✗             | ✓          | ✓        | ✓              | ✓           | ✓          | ✓        |
| Mobile capture (photo→doc)         | △             | ✓          | ✓        | ✓              | ✓           | ✓          | ✓        |

The platform is **at least 3 maturity tiers below** every comparator.

---

## K. SCORING (1–10)

| Dimension                              | Score | Justification                                                                  |
|----------------------------------------|:-----:|--------------------------------------------------------------------------------|
| **Functional Completeness**            | **2**  | Three list pages + a per-site tab; no workflow, no version control, no templates|
| **UX / Information Architecture**      | **5**  | Heatmap and traffic-light matrix are strong; nothing else is differentiated     |
| **Data Integrity & Source-of-Truth**   | **1**  | All mock data; downloads synthesize placeholder text; no real DMS substrate     |
| **Integration Readiness**              | **1**  | Zero connectors; one hard-coded fake DMS URL                                    |
| **Compliance & Auditability**          | **1**  | No retention, no legal hold, no signed audit trail, no e-signature              |
| **Enterprise Scalability**             | **2**  | Client-side filtering; no virtualization; CSV export will OOM at 100k+ docs     |
| **OVERALL WEIGHTED**                   | **2.0** | A demo-grade prototype dressed up with thoughtful visuals                       |

---

## L. TOP 10 PRIORITY FIXES

1. **Pick a DMS substrate and build a real adapter layer**. Recommendation: SharePoint Online (M365) for operators on Microsoft stack, Box Enterprise for ones on Google/Mac, custom S3 + OpenSearch + Postgres for greenfield. Stop pretending the placeholder `dms.internal` exists.
2. **Implement a real version-control object model**: `Document` → `DocumentVersion[]` with `versionNumber`, `effectiveDate`, `supersededBy`, `checksum (SHA-256)`, `uploadedBy`, `comments`. Store all versions, default to latest-approved.
3. **Build the approval workflow state machine**: visual designer where the operator defines reviewer roles, sequence, parallel/serial, escalation rules, SLA timers, delegation. Reference: SharePoint Power Automate, M-Files Workflow.
4. **Integrate DocuSign or Adobe Sign** for any document requiring signature (lease, MSA, ATP, change order). Send envelope from the platform; receive signed PDF + audit certificate back automatically.
5. **Build the Document Template engine**: define templates (DOCX with merge fields) for Lease, Permit, RFDS stub, ATP. Bind to site metadata. Generate first draft with one click.
6. **Add OCR pipeline** (AWS Textract / Azure Form Recognizer) on every uploaded PDF/image. Index extracted text into a search engine (OpenSearch, Algolia). Surface full-text search.
7. **Add retention policy engine**: per-category retention period, expiry alerts, legal hold flag, automatic archive/delete with audit log.
8. **Replace the fake PDF viewer with PDF.js** (or Adobe PDF Embed API for premium). Ship Office Online preview integration for .docx/.xlsx/.pptx via M365 embed.
9. **Per-tenant configurable Required-Documents matrix**: today's hard-coded 14 doc types must be config — Verizon, Vodafone, Telefónica all have different required-doc lists per scope/phase. Admin module must own this taxonomy.
10. **Wire to Notification Engine**: upload → notify reviewer; approaching SLA → notify reviewer + manager; expiry approaching → notify site owner. None of this exists today.

---

## M. CONCLUSION

This module reads like a Figma prototype that was converted to React verbatim without ever being connected to a real document store. The visual design is competent and several patterns (Missing Report matrix, completeness donut, staleness pulse dot) are worth keeping. **Everything else needs to be rebuilt against an actual DMS substrate.** Until that happens, the platform's claim to "Document Management" is misleading and creates significant legal / regulatory exposure for any operator who deploys it expecting compliance-grade document handling.

Estimated rework: 1,200–1,800 engineering hours to reach minimum viable parity with SharePoint Online + DocuSign + a basic retention engine. 2,500–3,500 hours to match Documentum-class capability.
