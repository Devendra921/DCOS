# Deep Review: AI Marketplace + AI Agents + AI Insights Modules

**Reviewer:** AI Platform/Marketplace Architect (20+ yrs at Hugging Face, Replicate, OpenAI, Anthropic, telecom AI marketplaces)
**Date:** 2026-05-26
**Files Reviewed:**
- `src/modules/ai-ml/marketplace/pages/FWAAgentsListingPage.tsx` (28 lines — STUB)
- `src/modules/ai-ml/marketplace/pages/IBSAgentsListingPage.tsx` (28 lines — STUB)
- `src/modules/ai-ml/marketplace/pages/MWAgentsListingPage.tsx` (28 lines — STUB)
- `src/modules/ai-ml/marketplace/pages/MacroAgentsListingPage.tsx` (28 lines — STUB)
- `src/modules/ai-ml/marketplace/pages/Private5GAgentsListingPage.tsx` (28 lines — STUB)
- `src/modules/ai-ml/marketplace/pages/SmallCellAgentsListingPage.tsx` (28 lines — STUB)
- `src/modules/ai-ml/marketplace/pages/WiFiAgentsListingPage.tsx` (28 lines — STUB)
- `src/modules/ai-ml/marketplace/components/AgentGrid.tsx` (171 lines)
- `src/modules/ai-ml/marketplace/components/FeaturedConstellation.tsx` (146 lines)
- `src/modules/ai-ml/marketplace/components/Hero.tsx` (198 lines)
- `src/modules/ai-ml/marketplace/components/KpiRibbon.tsx` (45 lines)
- `src/modules/ai-ml/marketplace/components/ListingShell.tsx` (90 lines)
- `src/modules/ai-ml/marketplace/components/LiveRunFeed.tsx` (101 lines)
- `src/modules/ai-ml/marketplace/components/SiteTypeSwitcher.tsx` (65 lines)
- `src/modules/ai-ml/marketplace/components/TrendingPrompts.tsx` (59 lines)
- `src/modules/ai-ml/marketplace/components/WhatsNewRail.tsx` (49 lines)
- `src/modules/ai-ml/marketplace/components/FooterCTA.tsx` (33 lines)
- `src/modules/ai-ml/marketplace/components/primitives.tsx` (163 lines)
- `src/modules/ai-ml/marketplace/components/signatures.tsx` (460 lines)
- `src/modules/ai-agents/pages/AIAgentsPage.tsx` (198 lines)
- `src/modules/ai-agents/AIAgentsTheme.tsx` (32 lines)
- `src/modules/ai-insights/pages/AIInsightsOverviewPage.tsx` (197 lines)
- `src/modules/ai-insights/AIInsightsTheme.tsx` (27 lines)

**Benchmarks:** Hugging Face Hub (>1M models, 200K+ datasets), Replicate (model-as-API), AWS Marketplace AI/ML, Google Vertex AI Model Garden, Salesforce AppExchange, Microsoft Azure AI Studio Catalog, O-RAN Software Community xApp/rApp Marketplace, Ericsson Intelligent Automation Platform (IAP) rApp Catalog, Nokia AVA NM Marketplace, Mavenir AI-Driven Open RAN. Industry telco precedents: Vodafone TechZone, AT&T Acumos.

---

## A. Module Purpose Validation — Severe Module Proliferation & Identity Crisis

The single most damning architectural finding is that **three separate modules have been carved out of what should be one coherent AI platform**: `ai-marketplace` (under `ai-ml/marketplace/`), `ai-agents`, and `ai-insights`. They were each created on different dates (May 15, 22), have **three different visual languages** (dark theme with neon gradients for marketplace; light enterprise-blue theme for agents; light indigo-violet theme for insights), maintain **three different agent data models**, and answer none of the four critical product questions:

1. What is the difference between an "AI Agent" listed in `ai-agents/pages/AIAgentsPage.tsx` and an "Agent" sold in `ai-ml/marketplace/pages/*ListingPage.tsx`? Answer in the code: nothing fundamental — both have name, status, type/category, confidence/trust, last-action, actions-24h. Yet the data shapes are incompatible (`Agent` in AIAgentsPage line 38-42 vs `MarketplaceAgent` in `data/types.ts:38-62`), the styling is incompatible, and there is no shared registry. A user reaching `/ai/marketplace/wifi` sees a beautiful dark "WiFi Intelligence Storefront" with 9 agents, then clicks "AI Agents" in the nav and sees the **same** "RF Design Validator", "PCI Conflict Predictor", "MW Link Health Predictor" in a completely different visual context with no link between the two.

2. How does "AI Insights" relate to either? AIInsightsOverviewPage shows "Top AI Recommendations" (lines 83-89) that read like agent outputs — "Reallocate 3 crews from Dallas to Chicago Loop" is the *exact output* the "Crew Dispatch Optimizer" agent in AIAgentsPage.tsx:48 would produce. The Insights page is essentially the dashboard view of agent outputs, but it is implemented as a separate module with no data binding to the agent registry.

3. Where does this sit relative to the `ai-ml` parent module (review 22)? The marketplace lives at `ai-ml/marketplace/` (a sub-folder), implying ai-ml is the parent — yet `ai-agents` and `ai-insights` are *peers* of `ai-ml`, not children. This is incoherent: agents are AI artifacts, insights are AI outputs, marketplace is the AI distribution channel — they should all be children of one top-level "AI Platform" module. Hugging Face Hub does this correctly: Models, Datasets, Spaces, and Inference Endpoints are all under one hub.org namespace with shared identity, ratings, discussion, versioning.

4. Why are there **seven site-type listing pages** for the marketplace? FWA, IBS, MW, Macro, Private5G, SmallCell, WiFi are technologies, not Marketplace categories. Hugging Face does not have a separate page per ML framework (TensorFlow page, PyTorch page, JAX page) — it has *filters*. By creating seven physically separate React components, the codebase commits to seven independent React Router routes, seven independent data files (`fwa.ts`, `ibs.ts`, etc — all between 7-13KB of identical-shape hand-crafted mock data), seven SEO-distinct URLs that fragment search ranking, and seven places to update when the agent contract changes. A user looking for a "PCI Conflict Detector" agent that works for both Macro and Small Cell now has to discover it twice, or the operator has to duplicate the agent listing across two data files. The proper architecture is one `/ai/marketplace` page with a `siteType=` query param filter — exactly what the existing `SiteTypeSwitcher.tsx` already does with route changes (line 19: `navigate(st.routePath)`). The switcher's existence is itself proof the design is over-fragmented.

**Verdict on module purpose:** This is vaporware in the worst sense — three modules building the *same conceptual artifact* with three different schemas, none of which can actually publish, install, run, version, or bill for an agent. The total page count is **9 pages for what should be one of the most strategically important modules in the entire platform**, and 7 of those 9 pages are 28-line identical-shape stubs. By comparison, Hugging Face Hub has ~300 distinct user-facing surfaces (model card, model file viewer, dataset viewer, dataset card, Spaces editor, Spaces preview, Inference endpoint config, billing, organization, collections, papers, leaderboards, etc).

## B. Marketplace Workflow Audit — Catastrophic Gaps in Lifecycle

A real AI marketplace supports a full publish-discover-evaluate-deploy-monitor-version-retire lifecycle. The implementation does not support a single one of these workflows end-to-end. Verified gaps:

- **No agent publishing workflow.** There is no `PublishAgentWizard`, no `AgentManifest` editor, no schema validation UI, no model-card generator. The "Open Builder Studio" button in `FooterCTA.tsx:25` is a dead-end link with no destination. Hugging Face's `huggingface-cli upload` and Replicate's `cog push` are reference patterns — neither has any equivalent here.
- **No agent installation/integration workflow.** The "Try Now" button (`AgentGrid.tsx:144-152`) calls `msgApi.success("Launching ${a.name}…")` (`ListingShell.tsx:55`). It is literally a toast that prints the name and does nothing else. There is no input-form-rendering from input schema, no execution environment selection, no permission grant, no installation into operator's workflow, no follow-up "agent installed" confirmation, no scheduled-run setup. Replicate's "Run" button opens a typed input form derived from the model's `cog.yaml`; the current implementation has no equivalent.
- **No agent execution sandbox.** No isolation strategy, no resource limits, no per-run timeout configuration, no GPU/CPU/memory tier selection, no rate limiting visible.
- **No versioning UI.** The "Compare versions" button (`AgentGrid.tsx:38`) has no onClick handler. There is no version timeline component, no rollback control, no canary/shadow promotion (despite the data model having a `shadowMode` boolean at `types.ts:54`), no semver display anywhere in the card or detail view.
- **No agent retirement / sunset workflow.** Agents have a `status` enum (`live | running | idle | shadow | attention` — `types.ts:35`) but no `deprecated`, `archived`, `withdrawn`, `recalled` states. When OEM agents need to be pulled for SLA violations (Mavenir vs. Nokia rApp disputes are real industry events), there is no graceful sunset.
- **No reviews, ratings, or discussions.** Despite a "trust" score (0-100, `types.ts:48`) and "acceptance" rate (`types.ts:49`), there is no user-contributed rating, no thumbs up/down, no comment thread, no Q&A board. Hugging Face's discussions and Replicate's run-history-as-social are reference patterns.
- **No billing, no quotas, no metering.** `costPerRun` exists in the type (`types.ts:53`) but is not surfaced in any UI component — `AgentCard` renders runs/accept/saved/latency, never cost. There is no subscription tier, no freemium gate, no usage meter, no invoice link, no chargeback to cost center, no FinOps integration. Pricing models that should exist (pay-per-call, pay-per-token, subscription, freemium with quota, BYOM/bring-your-own-model) are entirely absent.
- **No multi-vendor publishing.** There is no concept of a publisher organization, no vendor verification badge (despite the design system having "verified" tier slots in `primitives.tsx:108-114`), no vendor-managed namespace, no vendor revenue share dashboard, no marketplace operator commission tracking.
- **No agent reviews for regulatory/compliance.** Telecom agents that interact with RF parameters, neighbor relations, mobility settings can violate regulatory caps (PCI confusion, PIM coordination, FCC Part 15 EIRP). There is no compliance review workflow, no regulatory sign-off field, no jurisdiction-tagging.
- **No xApp/rApp compliance.** The O-RAN Alliance defined the xApp (near-RT RIC) and rApp (non-RT RIC) artifacts with specific manifest formats (xApp Descriptor, rApp Onboarding Package), E2 service models, A1/O1/O2/R1 interfaces. None of these terms appear in the entire codebase. For a telecom RAN platform with an "AI Marketplace" this is a non-starter — Ericsson Intelligent Automation Platform, Nokia AVA, Mavenir MAVair, Samsung CognitiV all ship rApp catalogs with strict O-RAN compliance.

## C. Screen-by-Screen Review

**C.1 — Seven Site-Type Listing Pages (28 lines each).** These pages are *identical* except for the imported data file and Signature component (line 5 import path differs, line 19 Signature component name differs). The seven pages are pure duplication that should collapse to a single dynamic route `/ai/marketplace/:siteType` with `useParams()` resolving the config. Maintenance cost: any change to `ListingShell` props requires updating 7 files; any new site type requires adding an 8th file. This is a textbook anti-pattern for a "thin shell over data" composition.

**C.2 — Hero (`Hero.tsx`).** Visually impressive (animated mesh background, dual-gradient nodes, status pills), but is functionally a search box that doesn't search (`Input` has no `onChange`/`value`/`onPressEnter` — `Hero.tsx:122-134`) and a "Launch Co-Pilot" button with no `onClick` (`Hero.tsx:135-145`). The "AI MARKETPLACE · SITE TYPE" eyebrow and "v2.0 · DRAFT" badge tell the user they are looking at unfinished work. The live-status panel claims `${liveCount} agents active` and `${runsToday.toLocaleString()} agent runs` (`Hero.tsx:55-56`) — both computed from a hand-crafted mock array of <10 agents. At demonstration scale this lies to the buyer.

**C.3 — KpiRibbon (`KpiRibbon.tsx`).** Generic sparkline-and-delta tile grid. Sourced from `data/*.ts` files with hand-edited `spark: number[]` arrays. The KPI definitions are bespoke per site-type (no enforced schema) so there is no way to compare "Acceptance Rate" across WiFi and Macro because the marketing copy of each KPI is hand-written.

**C.4 — FeaturedConstellation (`FeaturedConstellation.tsx`).** Beautiful SVG visualization of featured agents in a radial layout. But: it only shows up to 6-7 agents (otherwise nodes overlap), labels truncate aggressively (`shortName(...).slice(0, 22)` line 6), and the hover tooltip duplicates information already in the card grid below. This is decorative — it does not aid discovery in a catalog of 50+ agents. Hugging Face Hub does not use radial layouts; it uses ranked lists with multiple sort orders.

**C.5 — AgentGrid (`AgentGrid.tsx`).** The strongest component. Shows TrustRing (`primitives.tsx:59-84`), StatusDot, badges, stats (Runs/Accept/Saved/Latency), sparkline, Try/Details/Policy actions. Three structural problems: (1) "Details" button has no onClick — no agent detail page exists; (2) the facet chip row at line 42-65 supports only single-select (state is `string`, not `string[]`) — real catalogs need multi-facet AND-filters; (3) there is no search-within-grid, no sort options (popular/newest/highest-rated/cheapest), no pagination — once you have 100+ agents this grid becomes unusable.

**C.6 — LiveRunFeed (`LiveRunFeed.tsx`).** A scrolling feed of run events with status icons and confidence%. The `setInterval(..., 1500)` at line 28-31 increments a `tick` state that is *never read* (line 32: `void tick;`) — this is meaningless busywork that triggers a re-render every 1.5s with no state change. The feed is static mock data: there's no WebSocket, no SSE, no polling against any real API. "STREAMING" label is false advertising.

**C.7 — TrendingPrompts (`TrendingPrompts.tsx`).** Lists "Top community prompts" with uses-today. `onPick` callback calls `msgApi.info('Prompt: ${p}')` (`ListingShell.tsx:78`) — clicking a prompt produces a toast, not an actual agent invocation with that prompt prefilled. No prompt library management, no user-contributed prompts, no upvoting, no copy-to-clipboard, no fork-and-edit.

**C.8 — WhatsNewRail (`WhatsNewRail.tsx`).** Release/policy/eval/incident timeline. Static data. No filter, no subscription, no RSS, no Slack/Teams webhook integration. Each item is a 50-character title + a 90-character body — at telecom scale this is too sparse to be useful as a release-notes channel.

**C.9 — FooterCTA (`FooterCTA.tsx`).** Dead "Open Builder Studio" button. Promises "Build your own ${siteType} agent" but no Builder Studio module exists in the codebase.

**C.10 — Signature visualizations (`signatures.tsx`).** Genuinely beautiful and the only thing that looks like RAN domain understanding (WiFi mesh, IBS floor coverage, MW Fresnel zone, Private 5G campus zones). However, they are *static decorations* in the right rail with no interactivity (no zoom, no click-through to the underlying site, no live data binding). Beautiful art, no function.

**C.11 — AIAgentsPage.tsx (`ai-agents`).** Light-theme, AntD-cards, 12 hard-coded agents (line 43-56). Status toggle (Pause/Resume) works locally via `useState` but is not persisted, not backed by any API, and has no real consequence — pausing the "Schedule Conflict Resolver" doesn't actually stop anything because nothing is running. Filter chips for All/Prediction/Optimization/Autonomous/Copilot are conceptually meaningful (real taxonomy: predictive, prescriptive, autonomous-agentic, conversational) but conflict with the marketplace's `tier` taxonomy (recommended/trending/new/high-impact/needs-approval — `types.ts:36`). The two pages classify the same artifacts on incompatible axes.

**C.12 — AIInsightsOverviewPage.tsx (`ai-insights`).** Single 197-line page with 5 program KPIs, 8 "Ecosystem Signals" (Rollout/Risk/Financial/Vendor/Workforce/Quality/Schedule/Clusters), 5 hard-coded recommendations, 4 impact tiles. This is essentially a *Program Director executive dashboard* — and it overlaps massively with the dashboards in `reporting-dashboards` (review 21), site-lifecycle program views, and financial-management exec dashboards. None of the values are computed; they are inline string literals (e.g., `"$2.8M"`, `"37"`, `"82"`). There is no drill-down, no time selector, no period comparator, no export. Single non-navigable read-only screen.

## D. Telecom Domain Validation

The signatures.tsx file is the **only domain-credible artifact** in the entire 3-module set. The Fresnel zone overlay (`MwSignature` lines 304-310), the 3-sector arc with α/β/γ labels (`MacroSignature` lines 359-413), the eMBB/URLLC/mMTC slice labels in Private 5G (`Private5gSignature` lines 420-425), the indoor floor-by-floor coverage decay (`IbsSignature` lines 165-205) all demonstrate real RAN engineering literacy. Credit where due.

But the agent catalog itself betrays shallow domain knowledge:

- The 12 agents in AIAgentsPage are generic — "Site Risk Scoring", "Crew Dispatch Optimizer", "Vendor Performance Scorer" — these are PMO/operations agents, not RAN-engineering agents. There is no "Massive MIMO Beamforming Optimizer", "Cell Reselection Parameter Tuner", "Neighbor Relation Pruner", "VoLTE Handover Failure Diagnoser", "5G NR PRACH Configuration Validator", "PIM Source Locator", "C-band/CBRS Coexistence Coordinator", "Energy-Saving Cell-Sleep Scheduler" — all the actually-valuable AI/ML use cases for a RAN platform.
- The marketplace per-site-type data files (e.g., `fwa.ts`, `macro.ts`) likely contain more domain-specific agents but the listing pages all funnel through the same ListingShell so the user cannot tell from page architecture which agents are operations vs RAN-engineering vs network-design.
- "Trust" is undefined. The TrustRing in `primitives.tsx:59-84` renders a 0-100 percentage but the underlying meaning is never explained. Trust in what? Output correctness? Vendor reputation? Model freshness? Hugging Face uses concrete metrics (BLEU, ROUGE, F1, accuracy on specific eval sets). Replicate uses verified output samples. A generic "trust = 87" number is not actionable.
- "Acceptance %" is undefined too. Acceptance of recommendations by operators? Pass-rate of policy checks? The naming is ambiguous.

## E. Data Review — Hard-Coded Mock Data Across All 3 Modules

Every single number, every name, every status, every chart, every signal, every recommendation in all three modules is a hand-edited string or array. There is no Redux store, no React Query/SWR cache, no API client, no GraphQL schema, no Apollo Client, no contract definition (OpenAPI/Protobuf), no MSW handlers for the agent catalog. The data files in `ai-ml/marketplace/data/*.ts` are TypeScript modules with `export const AGENTS: MarketplaceAgent[] = [...]` literals.

At a real Tier-1 operator with 100K+ sites and 50+ agents, the data scale is: 50 agents × ~30 metadata fields × daily metric updates × 100K site contexts × tenant isolation × version history = millions of rows. The current "data file per site type" pattern would require shipping a new JS bundle every time a single agent metric changes.

The agent metric model itself is missing critical fields:
- No `inputSchema` / `outputSchema` JSON Schemas (Hugging Face/Replicate standard).
- No `modality` (text, image, audio, table, RAN-config, network-topology, ML-model-output).
- No `framework` / `runtime` (PyTorch, ONNX, TensorRT, Triton, Python/Node/Java service).
- No `slo` block (target P50/P95/P99 latency, target accuracy, target cost).
- No `dataLineage` (training data sources, evaluation datasets, drift watch).
- No `evalSet` reference (HuggingFace's "model card → evaluation results" pattern).
- No `auditLog` reference (who ran it when with what inputs/outputs — required for SOX/ISO 27001).
- No `securityPosture` (PII handling, data residency, encryption-at-rest/in-transit).
- No `dependencies` (does this agent require another agent's output? — DAG/lineage).

## F. Scalability Review

At target scale (50,000 agents in the catalog, like Hugging Face has 1M+ models), the current architecture fails on every axis:

- **UI:** The `AgentGrid` renders all filtered agents at once (`AgentGrid.tsx:71-74`) — no virtualization, no infinite scroll, no pagination. At 1,000 agents the DOM is 30,000+ nodes. At 10,000 the page freezes.
- **Data:** All agent data is shipped in the JS bundle. With 50 agents × 1KB each that's 50KB per site-type × 7 site types = 350KB just for marketplace mock data shipped to every visitor. At 50,000 agents this is 50MB of static JS.
- **Search:** No fulltext search, no semantic search (vector search is the new minimum for AI catalogs — Pinecone/Weaviate/pgvector/Qdrant). Users cannot find agents by capability.
- **Filtering:** Single-facet only.
- **Routing:** Seven hard-routed pages cannot scale to 20+ site types or telecom-adjacent product lines.
- **Multi-tenancy:** No tenant scoping. A real telco marketplace must isolate vendor-published agents from operator-private agents from open-source agents.
- **i18n:** All strings hard-coded English. No `useTranslation` hook visible. RAN platforms ship to LATAM, EMEA, APAC.
- **a11y:** Custom SVG visualizations with no `aria-label`, no role attributes, no keyboard focus management. The constellation hover state is mouse-only.
- **Theming:** Three incompatible color schemes hard-coded across the three modules — switching tenant branding is not possible.

## G. AI Opportunities — Ironically, the AI Modules Have the Least AI

The deepest irony: the AI Marketplace, AI Agents, and AI Insights modules contain *no LLM integration*, no embedding-based recommendation, no semantic search, no chat interface, no copilot. They are static catalog/dashboard shells decorated to look AI-themed. Specifically missing:

- **Agent-of-agents orchestration.** Multi-step workflows that compose agents (LangChain/CrewAI/AutoGen patterns) are completely absent.
- **Recommender system.** "You ran agent X — these agents commonly run together with X" is the marketplace 101 feature (Amazon, Netflix, Hugging Face Spaces). Not present.
- **Embedding search.** A 384-dim sentence-transformers embedding per agent tagline + a vector index would enable "find agents that detect anomalies" semantic queries. Not present.
- **Natural language agent invocation.** The Hero search box (`Hero.tsx:122-134`) suggests "Ask a $siteType question or search agents…" but is non-functional. The actual function — parse intent, dispatch to agent, render result — is missing.
- **LLM-generated agent descriptions and model cards.** The taglines and descriptions are static.
- **Auto-evaluation harness.** Hugging Face's `evaluate` and Replicate's batch-eval — none here.
- **Drift detection.** Agent accuracy/acceptance can drift; no drift dashboard.
- **Bias and safety audit.** No fairness metrics per protected attribute, no jailbreak/prompt-injection eval.

## H. UX & Visualization Recommendations

Recommended consolidation plan:

1. **Merge the three modules into one top-level `ai-platform` module** with sub-routes: `/ai/catalog` (formerly marketplace), `/ai/agents/installed` (formerly AIAgentsPage — your installed/active agents), `/ai/insights/program` (formerly AIInsights — the dashboard rollup), `/ai/runs` (run history), `/ai/builder` (agent authoring), `/ai/billing` (usage and cost).
2. **Collapse the 7 site-type listing pages into 1 dynamic route** `/ai/catalog?siteType=X&facet=Y&sort=Z`. Site-type becomes one of many filter facets, not a route segment.
3. **Add an Agent Detail page** at `/ai/catalog/agent/:code` with: hero (name, tagline, vendor badge, version), input/output schema with try-it form (Replicate pattern), run history (last 100 runs with inputs/outputs), reviews/ratings, model card (intended use, limitations, training data, eval results), changelog, billing, related agents.
4. **Replace the constellation with a `RAN System View` overlay** — show agents pinned to the actual RAN topology (sites/cells/links) so an operator sees agents in *physical context*.
5. **Make the Hero search bar a true semantic search** with embedding-backed retrieval, autocomplete, and recent-searches.
6. **Add a unified agent registry data model** (TypeScript interface shared by all 3 modules) with `inputSchema`, `outputSchema`, `version`, `publisher`, `pricing`, `slo`, `evalResults`, `auditLog`, `regulatoryStatus`.
7. **Add a Builder Studio page** (referenced in FooterCTA but not implemented): manifest editor, schema editor, eval-set selector, shadow-mode toggle, approval-policy editor, publish workflow.
8. **Add Compare view** — multi-select agents in the grid, see side-by-side metrics (Hugging Face leaderboard pattern).
9. **Add Run History page** — every agent invocation logged, filterable by user/agent/time/status.
10. **Standardize the three module themes** — pick one (recommend the light enterprise theme since most of the platform uses it).

## I. Technical Architecture Concerns

- **Inline styles everywhere** (every component uses `style={{...}}` objects, no CSS-in-JS, no Tailwind, no design tokens beyond a handful of color constants). The `T1/T2/T3/BG/EMERALD/...` constants in `primitives.tsx:6-19` are not used by `ai-agents` or `ai-insights` — each module redefines them.
- **No state management beyond `useState`.** The Pause/Resume in AIAgentsPage line 73-75 is local; on page reload all changes are lost.
- **No data layer.** No API client interfaces, no React Query, no DTOs.
- **No error boundaries.** A null in any agent record will crash the page.
- **No loading states.** Mock data is synchronous — when the real API arrives, the entire grid will need spinner/skeleton states (none present).
- **No tests.** No `*.test.tsx`, no Storybook stories visible from the directory listing.
- **Three incompatible status enums.** Marketplace has `live | running | idle | shadow | attention` (types.ts:35). AIAgentsPage has `Active | Paused | Degraded` (line 34). AIInsights has `healthy | watch | critical` (line 56). Unifying these is foundational.
- **Coupled state in ListingShell.** The `msgApi.success` calls in `ListingShell.tsx:55,69,78` mix navigation/dispatch concerns into a presentational shell. These should be parent-level event handlers passed down via props.
- **Decorative re-renders.** `LiveRunFeed.tsx:28-32` re-renders on a 1.5s interval for no reason — production performance hazard.

---

## SCORING (1-10 scale, 10 = world-class)

| Dimension | Score | Justification |
|---|---|---|
| Module Purpose Clarity | **2/10** | Three modules doing the same job with incompatible schemas; identity crisis. |
| Workflow Completeness | **1/10** | No publish, no install, no run, no version, no retire, no bill — only browse. |
| Screen Depth | **3/10** | 9 pages where Hugging Face Hub has ~300; 7 of 9 are 28-line stubs. |
| Telecom Domain | **4/10** | Beautiful signatures.tsx; generic agent catalog with no RAN-specific agents (no MIMO, no NR PRACH, no PIM, no neighbor pruning). No O-RAN xApp/rApp compliance. |
| Data Validity | **1/10** | 100% hard-coded TS literals; no API contracts; no eval results; no audit trail. |
| Scalability | **2/10** | Bundle ships 350KB of mock data; no virtualization; no pagination; no search index. |
| AI Capability (ironic) | **1/10** | Zero LLM integration, zero semantic search, zero recommender, zero copilot. |
| UX & Visualization | **5/10** | Hero/Constellation/Signatures are beautiful; Insights/Agents pages look like generic AntD dashboards. Three incompatible themes. |
| Technical Architecture | **2/10** | Inline styles, three duplicate status enums, no state mgmt, no data layer, dead-end CTAs everywhere. |
| Integration with Platform | **2/10** | No link to Site, Cell, Crew, Vendor, or any real platform object from agent outputs. |
| **OVERALL** | **2.3/10** | Vaporware — a beautifully styled marketplace shell with no marketplace mechanics. |

---

## TOP 10 PRIORITY FIXES (Ranked by Business Impact × Effort Inverse)

1. **MERGE the three modules into one `ai-platform` module** with shared agent registry, shared status enum, shared theme. This is the foundation for everything else and is mostly code-organization work.
2. **COLLAPSE 7 site-type listing pages into 1 dynamic route** `/ai/catalog?siteType=:k`. Saves 6 files, eliminates a class of duplication bugs, and frees the architecture from a fragmented URL surface.
3. **Build an Agent Detail page** (`/ai/catalog/agent/:code`) — without this, "Try Now" cannot do anything meaningful. Should include input-form rendering from a JSON Schema (Replicate pattern), run history, and reviews.
4. **Define a canonical `Agent` schema** including `inputSchema` (JSON Schema), `outputSchema`, `version`, `publisher`, `pricing`, `slo`, `evalResults`, `auditLog`, `regulatoryStatus`, `dependencies`. This is THE platform contract.
5. **Wire the Hero search box to a real (or stub) semantic search service** — even a `Fuse.js` fuzzy search over agent name/tagline/category would be a 10× usability improvement over the current no-op.
6. **Implement the Builder Studio page** referenced in FooterCTA — manifest editor, eval picker, shadow-mode toggle, approval-policy editor, publish flow. Without authoring, this is not a marketplace; it's a catalog.
7. **Add real O-RAN xApp/rApp metadata** (xApp Descriptor, rApp Onboarding Package, E2 Service Model, A1/O1/O2/R1 interface badges). A telecom AI marketplace without O-RAN compliance is not a serious product.
8. **Add usage/billing/quotas surface** — Cost Center, Budget, Quota Remaining, Invoice Download. Even mock UI tells stakeholders the platform supports FinOps. The data model already has `costPerRun` (types.ts:53) — wire it.
9. **Replace constellation with RAN-topology pinned view** — overlay agents on the actual site/cell/link map so operators see agents in physical context. Reuse the GIS/Maps module visualizations.
10. **Connect AIInsights recommendations to AIAgents outputs** with a `triggeredBy: agentCode` field so users can trace every recommendation back to the agent that produced it. This single fix turns Insights from a static dashboard into a credible AI control panel.

---

**Closing assessment:** The AI Marketplace + Agents + Insights cluster is among the lowest-maturity areas of the platform — high-visibility, demo-friendly, but functionally hollow. The signature visualizations and constellation are best-in-class demos; everything behind them is a stub. The path forward is module consolidation, schema unification, and building the missing core workflows (publish, run, version, bill). At current trajectory this is a marketing surface, not a product.
