# Module 22 — AI/ML Engine (Pages) — Deep-Dive Enterprise Review

**Reviewer:** AI/ML Architect (telecom operations specialty — 20+ yrs MLOps, model monitoring, feature stores, LLM integration at Tier-1 operators)
**Scope:** 27 AI-specific pages in `src/modules/ai-ml/pages/` — 10,051 lines of TSX, ~28 KB average file size, zero shared inference layer
**Marketplace pages explicitly excluded** (covered in Module 23).
**Verdict (one sentence):** This module is an extraordinarily polished **AI-themed presentation layer with zero ML substance underneath** — there is no model, no inference, no feature store, no drift monitoring, no audit chain, no training pipeline; it is a Figma comp rendered in React, and treating it as a serious AI capability without rewriting the entire data and model layer would be reckless.

---

## A. Module Purpose Validation

### Stated Purpose
The 27 pages collectively present themselves as an enterprise AI/ML platform for telecom rollout, claiming to deliver: delay prediction (regression), vendor anomaly detection (statistical), site risk scoring (composite), smart crew scheduling (optimization), process mining (algorithmic discovery), scenario simulation (Monte Carlo), root cause analysis (Pareto), photo computer-vision validation (object detection + measurement), NLP blocker categorization, velocity & S-curve forecasting, similar-site nearest-neighbor matching, and field-audit remediation guidance. The header of `AIDashboard.tsx` declares "Predictive Analytics · Anomaly Detection · Computer Vision · Process Mining" and lists six "active models" with accuracy percentages, retrain cadences and a green "Last sync: 2 mins ago" pill.

### Is the module needed?
Yes — every one of these AI capabilities is a real, high-value need for a Tier-1 rollout operator at 100K+ sites. Tier-1 carriers (T-Mobile US, AT&T, Verizon, BT, Deutsche Telekom, Reliance Jio) all run dedicated ML platforms for these exact problems: TMO uses a SageMaker + Tecton stack, AT&T has DataRobot AutoML wrappers, Reliance Jio runs a custom MLflow + Kubeflow stack on Databricks. So the **business problem is real, the module's positioning is justified, and the page inventory matches industry best-practice surface area** (delay prediction, anomaly, CV photo QA, scenario simulation, process mining are exactly the Tier-1 AI use cases).

### Does it overlap?
Severe internal overlap. Three independent "S-curve / velocity forecast" surfaces exist (`AIVelocityForecast` 388 lines, `AISCurveForecast` 461 lines, `RolloutForecastDashboard` 555 lines) with overlapping logistic curves and "12 weeks ahead of plan" copy. Two independent "risk prediction" surfaces (`AISiteRiskHeatmap` + `AIRiskScoreDetail` versus `RiskPredictionEngine` 544 lines) with **incompatible risk score formulas**. Two independent scenario builders (`AIScenarioBuilder` + `AIScenarioResults` versus `ScenarioSimulator` 570 lines). Two bottleneck/process-mining surfaces (`AIProcessMining` versus `AIBottleneckAnalysis`). Two "insights hub" pages (`AIInsightsPage` 265 lines and `AIDashboard` 402 lines) showing nearly identical content with different mock data. This is a classic symptom of design iterations being committed in parallel without consolidation; an engineering org would never ship two competing risk-score implementations.

### Are boundaries clear?
No. The naming convention has a fault line: pages prefixed `AI*` (`AIDelayPredictions`, `AISmartScheduling`, …) belong to one wave of work, while pages without the prefix (`ProgramPredictability`, `RiskPredictionEngine`, `RolloutForecastDashboard`, `ScenarioSimulator`) are a second wave. Both waves are exposed in routes and neither has been deprecated. There is no module-level "AI engine" service, no shared `ml/inference.ts`, no model registry hook, no feature store abstraction — every page hard-codes its own mock array and its own SVG chart, so cross-page model consistency is impossible by construction.

**Domain score: 8/10 surface relevance. Architecture score: 2/10.**

---

## B. Workflow Audit — Missing States, Incorrect Transitions, Automation Gaps

A real AI platform requires twelve lifecycle stages. Below is the score of how many exist in this codebase.

| MLOps Lifecycle Stage | Present? | Evidence |
|---|---|---|
| Data ingestion pipeline | NO | No `data/` directory, no ETL hooks, no streaming consumer |
| Feature engineering / feature store | NO | Features are inlined as literal arrays. `AIModelPerformance.tsx:121-128` lists six "features" with weight/drift labels but they're string constants, not a Tecton/Feast schema |
| Training pipeline | NO | `AIModelManagement.tsx` has a "Trigger Retrain" button that fires `msgApi.success('${name} retraining scheduled (expected 2–4 h)')` — pure toast, no job submission |
| Model registry | PARTIAL | `MODELS` array (AIModelManagement.tsx:41-48) names six models with `v2.4.1`-style versions, but there is no MLflow URI, no S3/ABFS artifact path, no signature, no input schema |
| A/B testing / shadow deploy | NO | No champion/challenger, no canary, no traffic split control surface |
| Inference latency monitoring | NO | `AIPhotoValidationDetail.tsx:155` shows "Processing: 1.24s" as a hardcoded SVG label |
| Drift detection | COSMETIC | `AIModelPerformance.tsx:208-249` shows a Feature Drift table where the "drift" column is a hand-written string ("Low", "High", "Bimodal ⚠") — no PSI, no KL divergence, no Kolmogorov-Smirnov |
| Ground truth labeling pipeline | NO | `AIPredictionAuditLog.tsx:52-72` has actual-outcome columns ("Delay: 16 days ✓") that are hardcoded — no labeling UI, no labeler assignment workflow, no inter-annotator agreement |
| Human-in-the-loop feedback | UI ONLY | Accept/Reject buttons exist (`AIRecommendationReview.tsx`, `AISmartScheduling.tsx`, etc.) but only fire `setState` + toast; no payload is written to any feedback store for online re-training |
| Bias detection / fairness audit | NO | No demographic-parity or equal-opportunity metric anywhere; no vendor-fairness check despite vendor-anomaly being a core feature where Type-I error has commercial consequences |
| Explainability (SHAP/LIME/IG) | NARRATIVE | Risk factor "weight" percentages (e.g. AIRiskScoreDetail.tsx:24-30: Permit 25%, Acquisition 20%, …) are static literals not computed from any model — they're closer to a project manager's mental model than to SHAP values |
| Model deprecation / rollback | NO | `VERSION_HISTORY` (AIModelManagement.tsx:50-54) shows "v2.2.1 — Retired — Accuracy degraded below threshold" as text but there is no rollback button |

**Workflow score: 1/10.** None of the lifecycle is real. A real AI platform would have a `services/ml/` package with at minimum `featureStore.ts`, `modelRegistry.ts`, `inferenceClient.ts`, `feedbackStore.ts`, `driftMonitor.ts`, `experimentTracker.ts`. None exist.

---

## C. Screen-by-Screen Review

### 1. `AIDashboard.tsx` (402 lines)
The AI Intelligence Hub landing surface. Six KPI cards (Total Predictions=247, Active Anomalies=4, Model Accuracy=94.2%, …) with sparkline arrays that are literal numbers (lines 55-61). A six-row "Top At-Risk Sites" table with hardcoded site IDs (MIA-DAS-0015 etc.) that recur identically in 11 other files — the mock data has no single source of truth. The "Model Health" panel lists six models with accuracy and `retrain` strings ('3 days ago', '1 week ago', '5 days ago') but these strings are baked-in, not computed from `new Date()` so they become stale instantly. The "Models Active: 6 · Last sync: 2 mins ago" pill (line 218) is a hardcoded string. The page is visually striking — neural-network background SVG, indigo→violet gradient titles, animated pulse keyframes — and looks demo-ready, but contains zero state derived from any source other than module-local constants.

### 2. `AIDelayPredictions.tsx` (433 lines)
A milestone-delay prediction list. Ten predictions hardcoded (lines 33-44) with `risk`, `delay`, `conf`, `factor`, `factors` fields. A bubble chart with X=Risk, Y=Delay, size=Confidence — handsome but every value is the same literal as `PREDICTIONS[]`. The "Contributing Factors" waterfall chart on the right panel (lines 50-56) shows five factors with `pts` (Permit Delay=35pts, Vendor Risk=22pts, …). The selected site is *always* the first entry — `const TOP = filtered[0] ?? PREDICTIONS[0];` (line 250) — so the detail panel doesn't actually update when the user clicks a row. The "Model Delay Predictor v3.2" stamp (line 379) contradicts `AIModelManagement.tsx:42` which calls it v2.4.1. This is the kind of silent inconsistency that destroys engineering trust at a demo.

### 3. `AIVendorAnomalies.tsx` (407 lines)
Five vendor anomalies with the canonical "TowerBuild on-time dropped to 72% / -2.4 SD" example. The deviation is presented as `-2.4 SD` (line 26) but no σ or μ is shown, no rolling window, no contamination factor for Isolation Forest, no autoencoder reconstruction-error threshold. The radar chart (lines 51-132) plots six axes (On-Time Delivery, Quality, Rework, Safety, Documentation, Response Time) for baseline vs current — values 91/72, 88/76 etc. are literals (lines 56-57). The "Investigating" / "Mark Resolved" buttons (line 340) only mutate local state. **There is no statistical test** — a real anomaly detector would specify Z-score, Mahalanobis distance, EllipticEnvelope, IsolationForest contamination, or Autoencoder MSE threshold; none of those are mentioned anywhere in the file.

### 4. `AISiteRiskHeatmap.tsx` (332 lines)
Thirty hardcoded sites (lines 34-65) each with a `score` field that is just a number from 14–95 — no factor decomposition at this level, so the heatmap's "score" can't be reproduced. A 5×6 grid heatmap with bilinear color interpolation (riskColor function lines 26-32). The right-side semi-gauge needle is drawn from cos/sin geometry, but the gauge value is just `selectedSite.score`. The "TOP RISK FACTORS" list at the bottom (lines 155-159) is **hardcoded for every site** — Permit Complexity 88, Acquisition Status 90, Vendor Track Record 75 — so clicking any of the 30 sites shows identical factor breakdown. This breaks the basic promise of site-level risk scoring.

### 5. `AIRiskScoreDetail.tsx` (342 lines)
Detail view for site MIA-DAS-0015 with the alleged composite-risk formula. Five factors with declared weights (Permit 25%, Acquisition 20%, Vendor 20%, Material 20%, Weather 15% — sum = 100%, OK) and individual scores 88/90/75/62/60. The displayed `pts` are weight×score/100 = 22.0/18.0/15.0/12.4/9.0 — these are arithmetically correct (88×25/100=22, etc.) which is a rare detail-accuracy win in this module — but the **composite total displayed is 95/100**, not 76.4 which is what the math actually yields. The discrepancy goes uncaught. A real composite-risk model would either be linear-weighted (giving 76.4) or non-linear-additive with documented coefficients; both must reconcile. Three "Recommended Mitigations" (P1/P2/P3) are hardcoded with fixed `reduction: '-8 pts'` etc. — no actual reduction estimator behind them.

### 6. `AISmartScheduling.tsx` (448 lines)
Five "crew-to-site" recommendations with confidence 91/85/82/77/74 (lines 33-79). Each recommendation has fields `proximity`, `skillMatch`, `materialsReady`, `travel`, `completion`. There is no optimizer — no OR-Tools CP-SAT, no Gurobi, no linear program, no Hungarian assignment algorithm. The fact that confidence happens to be sorted (91, 85, 82, 77, 74) and priority happens to align (CRITICAL, HIGH, HIGH, MEDIUM, MEDIUM) reveals these are hand-crafted demo cases, not optimizer outputs. The 3×5 skill-matrix (lines 82-88) is True/False literals. The Gantt-chart "scheduling timeline" places one crew per day Mon–Fri (lines 202-208) — visually convincing but lacking any constraint-satisfaction logic. A real smart-scheduling engine for telecom rollout needs: time-windows, skill compatibility, vehicle routing (VRP), capacity, crew rest hours, weather exclusion windows, multi-day jobs, and dependencies. None of these constraints are even modeled.

### 7. `AIProcessMining.tsx` (400 lines)
Process mining surface with seven phases (lines 16-24: Acquisition 18d avg vs 14 expected, …), five variants (Optimal 45%, Variant A 28%, Variant B 15%, …), and three anti-patterns (rework loop, skipped step, unusual sequence). A donut chart and a phase-flow diagram. **Process mining requires an algorithm** — Alpha Miner, Heuristic Miner, Inductive Miner, Fuzzy Miner, or DCR Graphs — applied to an event log with case_id/activity/timestamp triples. There is no event log on disk anywhere in the repo, no PM4Py reference, no XES file. The "variants" are simply five rows of a literal array. The "Run Analysis" button (line 286) is `setTimeout(…1800ms) → toast 'Process mining analysis started'`. A genuine implementation would invoke a backend job, return a process model (BPMN/Petri Net), compute conformance fitness (replay-based, alignment-based) and precision metrics, and visualize the result. The "234 completed site lifecycles" claim in the header (line 273) is unverifiable text.

### 8. `AIScenarioBuilder.tsx` (290 lines)
Scenario configuration with four parameters (crew count +5, shift hours +2h, crane +2 units, acceptance teams +2). The "Run Analysis" button (line 232) animates a progress bar via `setInterval(p+2, 80ms)` for ~4 seconds then toasts success. The displayed phrase "Processing 203 sites, running Monte Carlo simulation" (line 162) is a string — there is no Monte Carlo sampling. Monte Carlo for rollout simulation would require: distribution assumptions per uncertain parameter (e.g. Beta-PERT for task durations, Triangular for vendor reliability), N≥10,000 sample iterations, percentile computations (P10/P50/P90), and convergence diagnostics. None of this exists.

### 9. `AIScenarioResults.tsx` (263 lines)
Pre-baked results showing −12 weeks schedule, +$1.84M cost, +23% efficiency, with a "ROI analysis: $4.2M value of time-to-market acceleration vs $1.84M additional cost = net benefit $2.36M, Confidence 82%" narrative (lines 235-242). All numbers static. The sensitivity panel is a single text line "±2 weeks if crew ramp-up takes longer" — not a tornado chart with elasticities computed from the simulator.

### 10. `AIRootCauseAnalysis.tsx` (249 lines)
A Pareto chart (legitimate Pareto layout — bars sorted descending with cumulative-% overlay — this is one of the better-executed visualizations in the module). Six causes with counts 42/31/24/18/14/27 cumulating to 100%. The cumulative arithmetic checks: 27+20+15+12+9+17=100 ✓, and `cumPct` values 27, 47, 62, 74, 83, 100 are correct. The right `desc` field of each cause is a hand-crafted root-cause statement plus `action` text. There is no inferential analysis — no 5-Whys engine, no fishbone, no chi-squared independence test across vendor/region/crew. The "Vendors implicated" stat=4 is a literal. As a Pareto visualization it's solid; as root-cause analytics it's just a sorted bar chart.

### 11. `AIPhotoValidationQueue.tsx` (338 lines)
The computer-vision queue. Twelve photos with PASS/FAIL/UNCERTAIN/REVIEW status and confidence values (lines 41-73). Critically, **no actual image file is referenced** — each photo is represented by a CSS gradient placeholder and an icon (`<WifiOutlined />`, `<CameraOutlined />`, etc.) inside `<div style={{ background: photo.gradient }}>`. There is no `<img src={blob_url}>` anywhere. The "annotated bounding box" overlay at the bottom of the page is a static SVG with x:80 y:60 w:180 h:220 hardcoded coordinates (lines 84-86). A real CV system would: persist source images in object storage with content-hash addressing, run inference via a YOLOv8 / DETR / SAM / Mask-RCNN model on Triton or TorchServe, return bounding boxes + class labels + IoU + confidence scores, and store annotations in a queryable format (COCO JSON or LabelStudio task).

### 12. `AIPhotoValidationDetail.tsx` (334 lines)
Drill-down for NYC-MC-0001 antenna tilt. Detection details list (lines 39-46): Detected Tilt 6.2°, Design 4.0°, Tolerance ±1.0°, Deviation +2.2°, Coordinates (145, 203), Bounding Box (x:128, y:186, w:34, h:84). The numbers are arithmetically consistent — 6.2 − 4.0 = 2.2 ✓ — but the bounding-box coordinates (145, 203) lie outside the box (x:128–162, y:186–270), so the visual narrative is internally broken. Audit trail shows `09:14 AM Photo Uploaded → 09:14 AM AI Processing → 09:14 AM Result Generated FAIL` (lines 54-58); same-minute timestamps imply inference latency ≪1s but the Confidence panel says "Processing: 1.24s" (line 194). Internal numerical contradictions like these are everywhere. The "Remediation Steps" (lines 48-52) — "Loosen mounting hardware using 17mm torque wrench…", "Re-tighten to 25 Nm" — are well-written domain knowledge but they are static per-photo not generated from the failure category.

### 13. `AIModelManagement.tsx` (212 lines)
The "model registry". Six models with version, status (DEPLOYED/VALIDATING/TRAINING/RETIRED), accuracy, predictions count, retrain frequency, next retrain date (lines 41-48). Version-history table for the Delay Predictor showing v2.4.1 → v2.3.0 → v2.2.1 with the v2.2.1 row noting "Accuracy degraded below threshold" (line 53). This is the most plausible-looking page in the module: it cleanly imitates SageMaker Model Registry or MLflow's Models UI. But the data is all hardcoded; "Trigger Retrain" only toasts; there is no model URI, no input/output schema, no signature, no artifact reference, no deployment endpoint URL. There is also no separation between Model (artifact + version) and Endpoint (live serving) — a critical distinction in real MLOps.

### 14. `AIModelPerformance.tsx` (285 lines)
The model-monitoring surface. Four metric tiles (Accuracy 94.8%, Precision 93.1%, Recall 96.4%, F1 94.7%) computed via a *jitter* function `(Math.random()-0.5)*0.4` on refresh (lines 154-162) — i.e. the displayed metrics are intentionally fake noise around constants. Twelve-week accuracy trend with a "Model drift detected" annotation at W8 (line 72) where the value dips to 83.2% — but the dip and the annotation are both hardcoded; there is no actual drift detection running. The Feature Drift Analysis table (lines 121-128) lists six features with `dist` strings ("Normal", "Bimodal ⚠", "Right-skewed") and `drift` labels ("None"/"Low"/"Medium"/"High"). A real drift monitor would compute KS statistic, PSI, Wasserstein distance, or KL divergence per feature per evaluation window, with statistical-significance thresholds. None present.

### 15. `AIPredictionAuditLog.tsx` (310 lines)
The prediction audit table. Twenty rows with `id` (hex tokens like 'a1b2c3d4'), timestamp, prediction type, entity, model, prediction text, confidence, status, actual outcome, accuracy. This is the most structurally promising page — the column shape is exactly what a real audit log needs (prediction_id, model_version, input_hash, output, confidence, ground_truth, accuracy_metric, timestamp). The CSV export works (lines 178-205) and is well-implemented including RFC-4180 escaping. **But:** there's no `input_hash` for reproducibility, no `feature_snapshot` ID, no `inference_latency_ms`, no `request_id` correlating to a serving endpoint, no link to the model artifact URI. The ID format 'a1b2c3d4' is too short to be a UUID and too uniform to be a true hash — they're hand-crafted. A production audit log integrated with regulatory compliance (banking-grade) would also include immutable storage (WORM bucket), cryptographic hash chaining for tamper-evidence, and signed attestations.

### 16. `AIRecommendationReview.tsx` (262 lines)
Per-recommendation review with Accept/Partial-Accept/Reject decision plus optional notes. The decision is captured in local state `useState<Decision>(null)` (line 104) and submitted via `msgApi.success(...)` — no backend round-trip, no persistence. The supporting-evidence chart shows the TowerBuild on-time-rate timeline crossing the 80% threshold at W7 with an "Anomaly detected" annotation, identical visually to the same data on the Anomaly page — i.e. the recommendation does correctly trace back to its triggering anomaly, which is good information design even though both are static. The three-card impact analysis is well-structured (Schedule / Financial / Quality) and these would be the right output schema for a real recommendation engine.

### 17. `AIBlockerCategorization.tsx` (298 lines)
NLP classification of blocker free-text. Seven categories in a treemap, eight rows in a "Review Queue" with `excerpt` snippets ("Landlord refused access citing insurance expiry…") and `confidence` scores. The eight excerpts are themselves the entire training-set surface — there's no tokenizer, no embedding model (BERT / DistilBERT / GPT-style), no fine-tuned classifier, no class probabilities. Confidence values 68/71/64/72/69/55/48/73 are baked in. The histogram (`histBuckets`) and stacked-area trend over W13–W20 are again literal arrays. As a workflow shape it's accurate — multi-class text classification with confidence-thresholded human review is exactly how Apple, Google, and Meta operate their content moderation, customer-service triage, and content-categorization NLP systems. But the model under it is missing.

### 18. `AIBottleneckAnalysis.tsx` (351 lines)
Re-shows the same seven-phase process flow as `AIProcessMining.tsx` with slightly different numbers (Permits 28d vs expected 14d — same as ProcessMining; Civil Works 22d vs 15d — different from ProcessMining where Civil Works = 21 vs 17). This **numerical disagreement between two AI surfaces that purport to be measuring the same thing** is the kind of detail that destroys the credibility of an AI platform in front of an enterprise customer. There should be one source of truth (a process-mining service) and both UI surfaces should consume it.

### 19. `AIVelocityForecast.tsx` (388 lines)
Logistic S-curve plotted as planned (`maxSites=350, midpoint=24, steepness=0.18`), actual (different parameters), and forecast (different parameters again). The `sCurve()` function is a clean logistic implementation (lines 50-52). This is the most mathematically honest piece of code in the module: it's a *real* function that produces *real* curves and the confidence band is computed from upper/lower curves with different steepness. However the function is fed hardcoded parameters, not parameters learned from a Prophet / ARIMA / state-space model on a real time series. The "Optimistic / Predicted / Pessimistic" trio (lines 300-302) is three dates with no probability distribution behind them — should be P10/P50/P90 percentiles from a Monte Carlo run.

### 20. `AISCurveForecast.tsx` (461 lines)
A second S-curve page, larger and more elaborate, with two-tier confidence band (80% / 95%) **but the bands are computed by literal multiplication `*1.08 / *0.92 / *1.14 / *0.86`** (lines 88-91 of `RolloutForecastDashboard.tsx`, which `AISCurveForecast` mirrors). A real confidence band requires a posterior predictive distribution from a Bayesian forecast (Prophet's `mcmc_samples`) or a quantile-regression model. The 8%/14% values are arbitrary. Otherwise the visualization (especially the milestone diamonds and the today-line) is professionally executed.

### 21. `AIFieldAudit.tsx` (411 lines)
Mobile-style guided remediation flow for a failed antenna-tilt photo: three steps, an annotated SVG photo, checkbox acknowledgements, an audit trail with timestamps. Functionally this is a workflow UI, not an AI surface — the only AI element is the upstream FAIL result that triggered the audit. Reasonable UI.

### 22. `AISimilarSites.tsx` (281 lines)
"Nearest neighbor" UI: ten hardcoded similar sites with `match` percentages 94, 91, 88, 85, 83, 81, 78, 75, 72, 69 (lines 33-43) — a perfectly monotonic descent that no real similarity search would ever produce (real cosine distances cluster and have ties). There is no embedding step, no FAISS / Annoy / HNSWLIB / ScaNN index, no distance metric. The parameter-comparison bar chart compares Planned vs top-3 across Height, Tilt, Power, Az, SINR — useful information shape but the comparison values are constants.

### 23. `AIInsightsPage.tsx` (265 lines)
A second, simpler insights aggregator with predictions/anomalies/recommendations tabs. Overlaps heavily with `AIDashboard.tsx` and is likely an older or alternate version of the same surface.

### 24. `ProgramPredictability.tsx` (620 lines)
The biggest file in the module. Schedule Performance Index (SPI) trending over 24 weeks (lines 50-54), delivery-distribution histogram, phase-duration box-and-whisker plots (lines 104-110), 4×12 market×month predictability heatmap (lines 117-120), and variance-decomposition waterfall. **This is the most statistically literate page in the module** — boxplots with Q1/median/Q3/outliers, SPI moving average, and proper variance decomposition. Numbers are still literals but the page demonstrates the author understood the statistical idioms they were drawing. Of all the pages, this is the one closest to a real BI/analytics surface. It overlaps semantically with `AIVelocityForecast` and `RolloutForecastDashboard` though.

### 25. `RiskPredictionEngine.tsx` (544 lines)
Per-site risk table (twenty sites with `riskScore`, `trend`, `confidence`, `recommendedAction`, `revenue` — lines 77-97). Includes scatter-plot risk distribution, factor decomposition with sparklines, early-warning alerts. Uses a different mock-data source than `AISiteRiskHeatmap` so a "SITE-0042" appears here with risk 92 while MIA-DAS-0015 appears on the heatmap with risk 95 — the two views can never be reconciled. The factor sparklines (lines 109-116) are arrays of 8 numbers each — at least these are unique per factor (Permit Risk: 55→62→68→74→80→85→88→92).

### 26. `RolloutForecastDashboard.tsx` (555 lines)
Yet another S-curve. **However** this is the only file in the module that actually pulls data from a shared source: `import { aggregateAcrossPrograms, computeSCurveMetrics, getActiveSCurve } from '../../reporting-dashboards/lib/sCurveData';` (line 44). This is the right pattern — and the fact that exactly one of the 27 files does it makes the architectural deficit of the other 26 painfully visible.

### 27. `ScenarioSimulator.tsx` (570 lines)
A more advanced what-if surface than `AIScenarioBuilder`. Has sliders for crews/leadTime/permitTime/budget, a deterministic `calculateImpact()` function (lines 96-130) that computes `daysSaved = crewDelta*1.2 - leadDelta*0.8 - permitDelta*0.6 + (budgetDelta/1M)*3`. **This is a hand-coded linear elasticity model**, not a calibrated regression or simulation. The coefficients 1.2 / 0.8 / 0.6 / 3 are not estimated, they are guessed. On-time-rate is forced into [20, 98] via Math.min/max bounds — i.e. it's literally a calculator UI, not a simulator.

---

## D. Telecom Domain Validation

What the module *gets right* about telecom rollout:
- Phase taxonomy (Acquisition → Design → Permitting → Civil → Equipment → Integration → On-Air) — correct.
- Failure modes (zoning rejections, permit cycle, antenna tilt deviations, cable bend radii, grounding non-compliance per TR-068) — correct domain knowledge.
- Vendor KPIs (on-time delivery, rework rate, quality score, safety compliance) — correct.
- Tilt tolerance ±1.0° around design 4.0° — correct order of magnitude.
- Mounting torque 25 Nm / 45 Nm — within plausible range (manufacturers specify 25–50 Nm for typical mounts).
- 17mm torque wrench for typical antenna brackets — correct.
- Region groupings (Northeast / Central / South / West) — coarse but correct.

What it *gets wrong*:
- "5G DAS" tag for MIA-DAS-0015 (line 65 of AIDashboard) — DAS is technology-agnostic in standard taxonomy, "DAS" alone or "5G-capable DAS" is more accurate.
- Photo CV claims tilt detection from a single photo — in practice tilt is measured with an inclinometer mounted on the antenna; photo-based tilt inference requires the photo to be taken from a known reference plane (typically directly below) or to include a reference object, and accuracy is much lower than +/-1°. The "Detected Tilt 6.2°" needs a 3D-geometry justification not shown.
- The PCI/CBRS/ANR adjacencies are absent — telecom AI also predicts PCI mod-3 conflicts, neighbor-list optimization, CBRS PAL/GAA contention; none surfaced.
- Cell-site KPIs (RSRP, RSRQ, SINR, throughput, handover failure) are mentioned in `AISimilarSites.tsx` but never tied to a real RAN data source.

**Domain score: 7/10 — the surface vocabulary is correct, the depth is missing.**

---

## E. Data Review — Every KPI Audited

Sampled KPI consistency check across files (testing whether the *same* claimed metric agrees):

| Metric | AIDashboard | AIDelayPredictions | AIModelManagement | AIPredictionAuditLog | AIModelPerformance |
|---|---|---|---|---|---|
| Delay Predictor accuracy | 94.2% | model "v3.2" implied | 94.8% v2.4.1 | 92.4% avg | 94.8% (with jitter) |
| Model version | not shown | v3.2 | v2.4.1 | v2.4.1 | (per tab) |
| Total predictions | 247 | not shown | 247 | 1,247 | not shown |
| Active anomalies | 4 | n/a | 89 detector | 312 totals | n/a |
| Model retrain cadence | shown as "3 days ago" | n/a | "Monthly, May 1, next Jun 1" | n/a | n/a |

Conclusion: every cross-page rendezvous point shows numerical drift. This is what enterprise customers will spot first in a demo. **Score: 3/10.**

---

## F. Scalability Review at 100K+ Sites

- All page tables are **fully client-side**, no pagination beyond a 10-row local pager in `AIPredictionAuditLog`. With 100K sites this means rendering 100,000 DOM rows = browser death at ~5K.
- Heatmap (`AISiteRiskHeatmap`) hardcodes COLS=6, ROWS=5 — designed for 30 sites, not 100K.
- The bubble chart in `AIDelayPredictions` SVG-renders one `<circle>` per site — at 100K sites this is ~ 2.5M SVG elements, browser hang.
- No virtualization (`react-window`, `react-virtualized`, `tanstack-virtual`) imported anywhere in the module.
- No server-side filtering API; filter logic in `AIDelayPredictionsBody` is `.filter()` over the literal array.
- Prediction audit log has 20 hardcoded rows. With 100K sites × 10 predictions/week × 52 weeks = ~52M audit rows/year — needs columnar store (Parquet on S3 + Athena / DuckDB / ClickHouse).

**Scalability score: 2/10.** Nothing here will survive a real workload.

---

## G. AI Opportunities — What a Real Implementation Would Look Like

Per AI use case, the missing engineering:

| Use Case | Real Algorithm Stack | Current State |
|---|---|---|
| Delay prediction | Gradient Boosting (XGBoost/LightGBM/CatBoost) or a Transformer-based time-series model (TFT/N-BEATSx); features from feature store (Tecton/Feast); inference via SageMaker Endpoints or Vertex AI Endpoints; per-prediction SHAP values | Hardcoded JSON, no model |
| Vendor anomaly | Isolation Forest, OneClassSVM, or Autoencoder; sliding-window Z-score on per-vendor per-KPI series; alert when |z|>3 over 7-day rolling window; Mahalanobis distance for multivariate KPIs | Hardcoded "−2.4 SD" string |
| Photo CV validation | YOLOv8 / DETR / SAM2 for object detection; Hough-transform / PCA for tilt-axis extraction; ground-truth labeling pipeline (LabelStudio + CVAT); model versioning in MLflow; A/B between CV-v1 and CV-v2 in production; calibration plots (Brier score) | Static SVGs, no real image data |
| Process mining | PM4Py with Inductive Miner (IM-f / IM-c); event-log materialization from milestone-tracking DB; conformance checking (fitness + precision) on every closed site; BPMN export | Hand-drawn flowchart |
| Smart scheduling | Google OR-Tools CP-SAT for crew assignment, or Gurobi MILP; routing component (OR-Tools VRP); soft constraints for skill, distance, vehicle capacity, time window; daily re-optimization | Five hardcoded cards |
| Scenario simulation | Monte Carlo with N=10⁴ trials, Beta-PERT for task durations, copula-based correlation between vendor reliability and weather; Sensitivity via Sobol indices or tornado | `setTimeout(1800ms)` |
| Risk score | Logistic regression or shallow neural net with feature attribution via SHAP TreeExplainer or KernelSHAP; calibration via Platt scaling or isotonic regression; reliability diagrams | Hand-weighted sum |
| Root cause | Bayesian network learned from incident log; chi-squared test for vendor-region independence; FRPCA for failure-pattern dimension reduction | Hand-sorted Pareto |
| Velocity forecast | Prophet with `mcmc_samples=300` for posterior bands; or DeepAR for hierarchical (program/region/tech) forecasts; backtesting with rolling-origin CV | Logistic curve with fixed params |
| Similar sites | OpenAI text-embedding-3-large or sentence-transformers on site-description; FAISS HNSW index; cosine distance with re-ranker | Hardcoded match% |
| Blocker NLP | DistilBERT fine-tuned on 10K labeled blockers; calibration via temperature scaling; OOD detection via Mahalanobis on penultimate layer | Hardcoded confidence numbers |
| LLM integration | RAG over rollout knowledge base (project plans, vendor contracts, regulatory docs) with Claude 4.x or GPT-4.x; tool-use for issuing recommendations | Absent — zero LLM endpoints anywhere |

**A real reference implementation:** AWS reference architectures `aws-samples/sagemaker-mlops-workshop` + `aws-samples/amazon-sagemaker-feature-store-workshop`. For the LLM/RAG layer, the Anthropic Claude Tool Use cookbook + Amazon Bedrock Knowledge Bases is the standard pattern.

**AI Opportunities score: 9/10 (the *opportunity* is enormous) but Current state: 1/10.**

---

## H. UX & Visualization Improvements

What's good:
- The Pareto chart in `AIRootCauseAnalysis` — proper layout, correct cumulative %.
- The Confidence Ring component (`ConfRing`) is replicated *fifteen times* (in fifteen files) but is well-designed each time.
- The S-curve in `AISCurveForecast` with milestone diamonds is one of the better visualizations.
- The Photo Detail page has a properly thought-through AI Confidence breakdown (Object Detection 98%, Tilt Measurement 91%, Spec Comparison 99%).

What needs fixing:
1. **Stop replicating `ConfRing` in fifteen files** — extract to `shared/components/ConfidenceRing.tsx` and import once. Same for `RiskGauge`, `Sparkline`, `Confidence Band Plotter`. Currently each file re-defines them with subtle visual drift.
2. **Resolve the 95 vs 76.4 risk-score arithmetic** on `AIRiskScoreDetail`.
3. **The bubble chart "auto-selects first row" bug** in `AIDelayPredictions` (line 250). The detail panel should reflect the clicked row.
4. **The same site selected on `AISiteRiskHeatmap` always shows the same three factors** regardless of which cell is clicked. Each site needs its own factor decomposition.
5. **Photo placeholders need actual images** — even if mock, ship six real photos (one per category) so the CV demo has visual credibility.
6. **The "Last sync: 2 mins ago" pill** in `AIDashboard` must be computed from `Date.now() - last_sync_ts` not a baked-in string.
7. **Audit log IDs** should be UUIDv4 not 8-char alphabet codes.
8. **Refresh button on `AIModelPerformance` adds random noise** to KPIs — this is dishonest UX in a model-monitoring product. Either pull real metrics or disable the button.

---

## I. Technical Architecture Concerns

1. **Zero abstraction layer.** Every page reaches into a local `MOCK_DATA = [...]` array. There is no `ml/` service module, no `inferenceClient`, no shared types (`PredictionResult`, `ConfidenceBand`, `ModelMetadata`). Refactoring even a single field across the module touches ~15 files.
2. **Two-wave duplication.** `AI*` files vs `Program/Risk/Rollout/Scenario` files compete without a deprecation plan. Pick one wave, delete the other, before adding new pages.
3. **No data-flow contracts.** Each page invents its own data shape — e.g. `AIDashboard.AT_RISK` has `(id, name, risk, delay, conf, tech, factor, color)` while `AIDelayPredictions.PREDICTIONS` has `(id, name, tech, region, risk, delay, conf, factor, factors)`. These should be one `Prediction` type in `shared/types/ml.ts`.
4. **No state management for AI artifacts.** Accept/Reject buttons mutate local `useState`. There is no Redux/Zustand slice for recommendations, no React Query for predictions, no service worker for stale-while-revalidate.
5. **Constants like `T1 = '#0f172a'` are redefined in every file.** This is design-system entropy — should live in `theme/tokens.ts`.
6. **No tests.** I searched and found no `*.test.tsx` for any AI page.
7. **No accessibility.** SVG charts have no `<title>` / `<desc>` / `aria-label` elements; color-only encoding for risk; no keyboard navigation through site cards.
8. **Internationalization absent.** All strings are English literals.
9. **Performance.** Every page does heavy SVG render on every parent re-render — none use `React.memo`. With real data, FPS will tank.
10. **Security: nothing here writes user data, but if it ever does, prompt-injection through blocker text (Module-23-style risk) is unmitigated.**

---

## SCORING — by dimension (1–10)

| Dimension | Score | Notes |
|---|---|---|
| Workflow Completeness | **1** | None of the MLOps lifecycle exists |
| UX & Visualization | **7** | Visually polished, well-styled, internally inconsistent |
| Telecom Domain | **7** | Vocabulary correct, depth missing |
| Data Integrity | **3** | Cross-page numerical drift in every shared metric |
| Scalability | **2** | Will not survive >5K rows |
| AI/ML Substance | **1** | Zero real models, zero inference, zero training pipeline |
| Architecture | **2** | No abstraction layer, two competing waves |
| **Overall** | **3.3 / 10** | Demo-quality. Not production-ready. |

---

## TOP 10 PRIORITY FIXES (in order of impact)

1. **Establish a `services/ml/` package** with `inferenceClient.ts`, `modelRegistry.ts`, `featureStore.ts`, `predictionStore.ts`, `feedbackStore.ts`. Even if the v1 implementations are stub adapters around the existing mock arrays, *every page must consume through this layer* so future replacement with SageMaker / Vertex / Bedrock is one-config-flag.
2. **Deduplicate the two waves of pages.** Pick `AI*` *or* `Program/Risk/Rollout/Scenario` — not both. Route the other set to /deprecated.
3. **Define `Prediction`, `ConfidenceBand`, `ModelMetadata`, `RiskFactor`, `RecommendationEvidence` types in `shared/types/ml.ts`** and migrate every page to consume them. Currently the same concept is represented 6 different ways.
4. **Wire one real ML model end-to-end as proof of life.** Suggest: vendor anomaly via per-vendor rolling Z-score computed in TypeScript over a real Prometheus/metrics feed (no Python required). This proves the pipeline before investing in the heavier models.
5. **Replace the `AIModelPerformance` refresh-jitter with real metrics or remove the button.** Faking model metrics in a model-monitoring product is a credibility hazard.
6. **Implement a real Prediction Audit Log persistence layer** — UUIDv4 IDs, input-hash, feature-snapshot reference, inference-latency-ms, model-artifact-URI. Even SQLite via WASM in the browser would be more honest than the current in-memory array.
7. **Reconcile the AIRiskScoreDetail composite arithmetic** — 88×25 + 90×20 + 75×20 + 62×20 + 60×15 = 7640/100 = 76.4, not 95. Either fix the math, change the displayed total, or document a non-linear combiner.
8. **Resolve the AIDelayPredictions "selected row never changes" bug** — the right-panel detail must be the clicked row, not `PREDICTIONS[0]`.
9. **Per-site factor decomposition on the heatmap** — each of the 30 sites currently shows the same three factors. Provide site-specific factor arrays.
10. **Plan the LLM integration roadmap** — recommendations and root-cause narratives are obvious RAG candidates; an Anthropic Claude or AWS Bedrock-fronted endpoint with a small rollout-domain knowledge base would yield substantive copilot capability without a full ML platform investment. This is the highest-ROI AI move available to this product *today*.

---

## Closing Assessment

Compared against AWS SageMaker, Azure ML, Google Vertex AI, Databricks ML, MLflow, Kubeflow, Tecton — this module is at parity with **none** of them on substance. It is at parity with all of them on visual polish, which has real demo value but should not be confused with engineering value. The most honest thing to do before any further investment is to delete the parts that promise capabilities that don't exist (the "Trigger Retrain" button, the "Run Monte Carlo" progress bar, the random-jittered KPIs, the "Model drift detected" annotations), keep the parts that are useful as workflow UI (review queues, audit log, recommendation cards, photo-fail remediation), and rebuild the actual ML capability behind a service interface that the UI consumes through real API calls. The 27 pages have given the product team a beautifully detailed wireframe of what the AI platform should look like — that is genuine value, and the next phase of work is to fund the backend that makes the wireframe true.
