# AI Enhancement Roadmap

**Current AI Score: 1.5 / 10 — Vaporware. Zero real ML in codebase.**

---

## Brutal Current State Assessment

Grep across `/src` for ML frameworks returns ZERO results:
- `tensorflow` — 0 imports
- `torch` / `pytorch` — 0 imports
- `sklearn` / `scikit-learn` — 0 imports
- `onnx` — 0 imports
- `huggingface` / `@huggingface` — 0 imports
- `openai` / `@anthropic/sdk` — 0 imports
- `langchain` — 0 imports

Every "prediction", "accuracy", "confidence", "anomaly", "drift" value in the AI module is a hardcoded literal in a const array.

**The AI/ML, AI Marketplace, AI Agents, AI Insights modules are entirely theatrical.**

---

## Wave 0: Honesty Phase (Immediate — Weeks 1-2)

Before adding real AI, remove the false claims:

1. **Remove "AI" from page titles where no AI exists**
   - "AI Vendor Anomalies" → "Vendor Performance Analysis"
   - "AI Risk Score" → "Composite Risk Assessment"
   - "AI Smart Scheduling" → "Schedule Optimizer"
   - "AI Photo Validation Queue" → "Photo Review Queue"
2. **Replace "confidence" and "accuracy" labels with "estimate"** until real models exist
3. **Remove neural network animation backgrounds** that suggest model inference
4. **Move the 7 marketplace stubs to a single "Coming Soon" page**
5. **Add a banner on AI Insights pages: "Computed estimates, not ML predictions"**

This removes legal/customer-trust exposure from false AI claims.

---

## Wave 1: LLM Integration (Months 1-3)

**Strategy:** Use LLMs (GPT-4, Claude) for contextual narratives. Lowest engineering cost, highest user value.

### 1.1 Dashboard AI Briefings
**Pattern:** Pass dashboard KPIs to LLM, get executive summary
```typescript
// services/ai/briefings.ts
async function generateBriefing(context: DashboardContext): Promise<string> {
  const response = await anthropicClient.messages.create({
    model: 'claude-opus-4',
    messages: [{
      role: 'user',
      content: `Generate a 2-paragraph executive briefing on rollout status:
        Sites at risk: ${context.atRiskCount}
        Velocity: ${context.velocity}
        Budget variance: ${context.budgetVariance}
        Top blocker: ${context.topBlocker}`
    }],
    max_tokens: 500
  });
  return response.content[0].text;
}
```

**Where to deploy:**
- HomeCommandCenter top banner
- ExecutiveDashboard verdict expansion
- All module dashboards' AIInsightCard
- Daily email digest

**Effort:** 4 weeks. **Cost:** ~$0.20 per dashboard view at scale.

### 1.2 Natural Language Query (NLQ)
Connect CommandPalette to LLM with structured query output:
- "Show me sites in Texas at risk of delay" → Filter sites by state=TX AND riskScore>70
- "Why is program X behind?" → Auto-RCA narrative from dependent module data
- "What should I focus on today?" → Context-aware recommendations

**Effort:** 6 weeks. **Cost:** ~$0.50 per query.

### 1.3 Closeout Document Drafting
Auto-generate from site data:
- Site Closeout Certificate
- ATP Summary
- Lease Abstract
- Vendor Acceptance Letter

**Effort:** 4 weeks.

### 1.4 Incident Report Drafting
Voice → Whisper API → LLM-formatted incident report.

**Effort:** 3 weeks.

### 1.5 Rejection Justification Drafting
For BR-SAQ-008 (20-char min justification) — LLM-assisted draft based on context.

**Effort:** 2 weeks.

**Wave 1 Total:** 19 weeks of focused LLM integration. Delivers immediate user value.

---

## Wave 2: Statistical/Classical ML (Months 3-6)

**Strategy:** Build a Python FastAPI service hosting classical ML models. Connect via REST.

### 2.1 Vendor Anomaly Detection
**Model:** Isolation Forest + Z-score
**Features:** vendor_first_pass_rate, response_time, completion_rate, defect_density (7-day rolling)
**Output:** Anomaly score, top contributing features
**Page:** `AIVendorAnomalies` → real model

```python
# services/ml/vendor_anomaly.py
from sklearn.ensemble import IsolationForest
model = IsolationForest(contamination=0.05)
model.fit(vendor_features_history)
anomaly_score = model.decision_function([current_vendor_features])
```

**Effort:** 6 weeks (data pipeline + model + API + frontend wire-up).

### 2.2 Site Delay Prediction
**Model:** XGBoost / LightGBM
**Features:** site_type, region, phase, days_in_current_phase, vendor, permit_status, weather, crew_certification
**Target:** days_to_complete_current_phase
**Output:** Predicted delay + confidence interval (NOT a literal!)

**Effort:** 12 weeks (requires historical milestone data).

### 2.3 Permit Approval Timeline Prediction
**Model:** Quantile Regression (P10/P50/P90)
**Features:** jurisdiction, permit_type, submitter, season, complexity
**Output:** Predicted approval date with uncertainty band

**Effort:** 8 weeks.

### 2.4 Quality Risk Score
**Model:** Logistic Regression with monotonic constraints
**Features:** vendor_quality_history, crew_certifications, site_complexity, weather
**Output:** Probability of first-pass acceptance failure

**Effort:** 6 weeks.

### 2.5 Crew-Site Match Score
**Model:** Constraint programming + ML scoring
**Features:** crew_skills, certifications, proximity, current_workload, vendor_alignment
**Output:** Ranked crew assignments

**Effort:** 10 weeks.

### 2.6 Cost Overrun Prediction
**Model:** XGBoost regression
**Features:** site_complexity, vendor_history, market_conditions, scope_changes
**Output:** Predicted % overrun vs BAC

**Effort:** 8 weeks.

**Wave 2 Total:** 50 weeks of ML engineering. Genuine quantitative AI.

---

## Wave 3: Computer Vision (Months 6-9)

### 3.1 Photo Validation
**Model:** Fine-tuned ResNet/EfficientNet on telecom site photos
**Detects:**
- Tower verticality
- Antenna mounting correctness
- Grounding strap presence
- Cable management quality
- PPE compliance
- Signage/labeling

**Effort:** 16 weeks (data collection + labeling + training + deployment).

### 3.2 Tower Component Detection
**Model:** YOLOv8 / Detectron2
**Detects:** antennas, ODUs, RRUs, cables, cabinets, ladders
**Use Case:** Automated BOM verification from photos

**Effort:** 12 weeks.

### 3.3 Safety Compliance Check
**Model:** OpenPose + PPE Detection
**Detects:** Hard hat, harness, gloves, safety glasses
**Use Case:** Pre-climb safety verification

**Effort:** 10 weeks (high false-positive risk; requires careful threshold tuning).

### 3.4 OCR for Documents
**Model:** Tesseract or AWS Textract for structured docs (permits, leases)
**Use Case:** Auto-populate lease abstract from PDF

**Effort:** 8 weeks.

**Wave 3 Total:** 46 weeks of CV engineering. High visibility, high accuracy bar.

---

## Wave 4: Process Mining & Simulation (Months 9-12)

### 4.1 Real Process Mining
**Tool:** PM4Py or Celonis-style discovery
**Input:** Workflow event log (when implemented)
**Output:** Actual process model (discovered, not designed)
**Page:** `AIProcessMining` → real discovery

**Effort:** 12 weeks.

### 4.2 Discrete-Event Simulation
**Tool:** SimPy
**Use Case:** "What if we add 5 crews to region X?" / "What if vendor Y goes offline?"
**Page:** `AIScenarioBuilder` → real simulation

**Effort:** 16 weeks.

### 4.3 Monte Carlo for Schedule Risk
**Method:** Monte Carlo over PERT distributions
**Output:** P10/P50/P90 completion dates
**Page:** S-curve forecast pages → real probabilistic forecast

**Effort:** 8 weeks.

**Wave 4 Total:** 36 weeks.

---

## Wave 5: Autonomous Agents (Months 12-18)

### 5.1 Agent Framework
**Stack:** LangChain or CrewAI for orchestration
**Pattern:** Domain-specific agents with tool access

### 5.2 Site Readiness Agent
**Tools:** Read site data, read dependencies, read alarms
**Action:** Continuously evaluate if a site can advance phase
**Output:** Recommended phase advancement OR list of blockers

**Effort:** 12 weeks.

### 5.3 Vendor Performance Agent
**Tools:** Read vendor scorecards, read SLA breaches
**Action:** Detect underperforming vendors, recommend corrective actions
**Output:** Vendor performance recommendations

**Effort:** 10 weeks.

### 5.4 Procurement Agent
**Tools:** Read inventory, read forecasted demand, vendor catalog
**Action:** Auto-generate POs for replenishment
**Output:** Draft POs requiring human approval

**Effort:** 14 weeks.

### 5.5 Incident RCA Agent
**Tools:** Read incident report, search past incidents, analyze patterns
**Output:** Root cause analysis with confidence

**Effort:** 10 weeks.

**Wave 5 Total:** 46 weeks. Genuine autonomous AI.

---

## Wave 6: Platform Intelligence (Months 18-24)

### 6.1 Real Agent Marketplace
Replace 7 stub pages with:
- Agent registry with capability metadata
- Agent execution sandbox
- Pay-per-use or subscription billing
- Reviews and ratings
- A/B testing across agent versions
- O-RAN rApp/xApp compliance for agents in radio domain

**Effort:** 24 weeks.

### 6.2 Knowledge Graph
**Tool:** Neo4j
**Nodes:** Sites, Vendors, Crews, Equipment, Documents, Incidents
**Edges:** Depends-on, Manufactured-by, Operated-by, Caused, Resolved
**Use Case:** Cross-entity intelligence ("Show me everything affected by Vendor X")

**Effort:** 16 weeks.

### 6.3 Continuous Learning Loop
For each agent prediction:
- Capture ground truth (did the predicted delay actually happen?)
- Retrain monthly
- A/B test new versions
- Roll back on regression

**Effort:** 10 weeks.

**Wave 6 Total:** 50 weeks.

---

## Quick Wins (This Sprint)

If only 4 weeks available:
1. **Wire one LLM-generated insight to one dashboard** (ExecutiveDashboard banner) — 1 week
2. **Add real feedback buttons** ("helpful/not helpful") to AI insights — collect training signal — 1 week
3. **Remove false AI claims** from page titles where no AI exists — 0.5 weeks
4. **Add Whisper transcription** to MobileVoiceNotes (currently returns MOCK_TRANSCRIPT) — 1.5 weeks

---

## Total AI Investment Estimate

| Wave | Duration | Engineering Cost (3 ML eng × wave) | Cumulative Maturity |
|---|---|---|---|
| Wave 0: Honesty | 2 weeks | $30K | 1.5 → 2.0 |
| Wave 1: LLM | 3 months | $200K | 2.0 → 4.0 |
| Wave 2: Statistical ML | 3 months | $250K | 4.0 → 5.5 |
| Wave 3: Computer Vision | 3 months | $300K | 5.5 → 6.5 |
| Wave 4: Process Mining | 3 months | $200K | 6.5 → 7.0 |
| Wave 5: Agents | 6 months | $500K | 7.0 → 8.0 |
| Wave 6: Platform Intelligence | 6 months | $500K | 8.0 → 9.0 |
| **TOTAL** | **24 months** | **$1.98M** | **1.5 → 9.0** |

---

## Bottom Line

The platform's "AI" branding is **technically inaccurate as of today**. To honor that branding while protecting users from false confidence:
1. **Immediately remove AI claims** from non-AI pages (Week 1-2)
2. **Wire one real LLM integration** as proof point (Month 1)
3. **Build a real ML service** for the 5-6 highest-value use cases (Months 1-6)
4. **Layer in CV, agents, knowledge graph** progressively (Months 6-24)

**Estimated investment:** ~$2M over 24 months to deliver the AI promise that the UX already makes.
