# OSS/BSS Integration Strategy & Assessment

**Current Score: 1.8 / 10 — Functionally absent for Tier-1 operator adoption.**

---

## Current State

The `external-integration` module has 25 page files purporting to manage OSS/BSS integration. Forensic review reveals:

- **TWO competing list/detail page pairs** describing different endpoint catalogs (10 hand-coded mocks vs 13 in `extMockData.ts`) with no canonical truth
- **No service layer**: every page imports mock arrays directly
- **No SOAP/WSDL parsing** anywhere
- **No Kafka topic configuration**
- **No SFTP host-key handling**
- **No schema registry**
- **No TM Forum Open API alignment** (TMF638/642/622 absent)
- **Brochure-grade authentication**: OAuth2 with no scopes/PKCE; mTLS without cert upload; JWT without JWKS
- **Webhook templating uses string `.replace()`** — breaks on nested JSON
- **AES-256 at rest is a banner claim** with no KMS reference

**Verdict:** Integration UI exists. Integration substrate does not.

---

## Required Integration Surface for Tier-1 Operator

A real telecom rollout platform must integrate with **20-40 external systems** across the operator's IT stack. The current platform addresses 0 of these in any production-ready way.

### Layer 1: NMS / OSS Inventory (P0 — Blockers)

| System | Vendor | Protocol | Purpose | Currently |
|---|---|---|---|---|
| Ericsson NetAct / ENM | Ericsson | REST, NETCONF/YANG | RAN inventory, alarm feed, KPI ingest, configuration push | Listed only |
| Nokia NetAct | Nokia | REST, CORBA legacy | Same as above | Listed only |
| Huawei iManager U2000 | Huawei | REST, FTP, XML | Same as above | Listed only |
| Mavenir NMS | Mavenir | REST | C-RAN/vRAN management | Listed only |
| Netcracker OSS | Netcracker | REST, SOAP | Service inventory | Not modeled |
| Amdocs OSS | Amdocs | REST | Same as above | Not modeled |
| Tata Comm OSS | Tata | Custom | Multi-vendor abstraction | Not modeled |

**Integration Patterns Needed:**
- Site/sector creation push (when site goes On-Air)
- Alarm/fault ingest (real-time stream)
- Performance KPI ingest (batch, hourly)
- Configuration drift detection
- Software version sync
- Inventory reconciliation

### Layer 2: BSS Financial (P0 — Blockers)

| System | Vendor | Protocol | Purpose | Currently |
|---|---|---|---|---|
| SAP S/4HANA | SAP | OData, RFC | ERP, GL postings, AP, PO | Not modeled |
| Oracle ERP Cloud | Oracle | REST | Same as above | Not modeled |
| Workday Financials | Workday | REST | Same as above | Not modeled |
| Oracle BRM | Oracle | SOAP | Revenue, billing | Not modeled |
| Amdocs CES | Amdocs | REST | Customer ops, payment | Not modeled |

**Integration Patterns Needed:**
- PO sync from procurement to ERP
- GRN posting to ERP
- Invoice receipt from ERP AP
- Asset register sync
- Cost center hierarchy
- Budget validation
- GL posting for capex/opex events

### Layer 3: Planning Tools (P1 — Engineering Excellence)

| Tool | Vendor | Purpose | Currently |
|---|---|---|---|
| Atoll | Forsk | RF planning, design import/export | "Atoll export" toast-only stub |
| ASSET | Aircom | RF planning | Not mentioned |
| Mentum Planet | InfoVista | RF planning | Not mentioned |
| Pathloss | CommScope | MW path design | Not mentioned |
| iBwave | iBwave | DAS design | "iBwave" listed; no export logic |
| Ekahau | Ekahau | WiFi survey | Not mentioned |
| Survey365 | Custom | Site survey | Not mentioned |

**Integration Patterns Needed:**
- Bi-directional design sync
- Drive test data import (TEMS, NEMO, R&S)
- Coverage prediction overlay import
- BOM generation
- Project file import/export (XML, AFP)

### Layer 4: Field Service & Workforce (P1)

| System | Vendor | Purpose | Currently |
|---|---|---|---|
| ClickSoftware | Salesforce | Field service dispatch | Not modeled |
| ServiceNow FSM | ServiceNow | Field service management | Not modeled |
| IFS Field Service | IFS | Workforce optimization | Not modeled |
| Salesforce Field Service | Salesforce | Same | Not modeled |
| Workday HRIS | Workday | Workforce data | Not modeled |
| ADP | ADP | Time & attendance | Not modeled |

### Layer 5: Document Management (P2)

| System | Vendor | Purpose | Currently |
|---|---|---|---|
| SharePoint | Microsoft | Document repository | Not modeled |
| Microsoft 365 | Microsoft | Collaboration | Not modeled |
| Documentum | OpenText | Enterprise content | Not modeled |
| Box | Box | File sharing | Not modeled |
| DocuSign | DocuSign | E-signature | Not modeled |

### Layer 6: GIS (P1)

| System | Vendor | Purpose | Currently |
|---|---|---|---|
| ArcGIS Enterprise | Esri | Enterprise GIS | Not modeled |
| ArcGIS Online | Esri | Cloud GIS | Not modeled |
| QGIS | OSGeo | Open source GIS | Not modeled |
| Mapbox | Mapbox | Mapping platform | Not modeled |
| HERE Workspace | HERE | Routing, mapping | Not modeled |

### Layer 7: Regulatory (P2)

| System | Authority | Purpose | Currently |
|---|---|---|---|
| FCC ULS (US) | FCC | Spectrum licensing | Not modeled |
| FAA OE/AAA | FAA | Tower height registration | Not modeled |
| OFCOM (UK) | OFCOM | Spectrum | Not modeled |
| TRAI (India) | TRAI | Spectrum, licensing | Not modeled |
| ANATEL (Brazil) | ANATEL | Spectrum | Not modeled |
| OSHA ITA | OSHA | Injury submission | Not modeled |

### Layer 8: IoT/SCADA (P2)

| Protocol | Purpose | Currently |
|---|---|---|
| Modbus | Power, environmental sensors | Not modeled |
| OPC-UA | Industrial automation | Not modeled |
| DNP3 | Utility SCADA | Not modeled |
| MQTT | IoT messaging | Not modeled |
| LoRaWAN | LP-WAN sensors | Not modeled |
| NB-IoT | Cellular IoT | Not modeled |

### Layer 9: Cybersecurity (P0)

| System | Purpose | Currently |
|---|---|---|
| Active Directory / LDAP | User directory | Not modeled |
| Okta / Azure AD | SSO | Not modeled |
| HashiCorp Vault | Secrets management | Not modeled |
| Splunk / Datadog | Security monitoring | Not modeled |
| AWS KMS / Azure Key Vault | Key management | Not modeled |

---

## Required Integration Architecture

```
                    ┌─────────────────────────┐
                    │   RAN Platform UI       │
                    └────────┬────────────────┘
                             │
                    ┌────────▼────────────────┐
                    │   API Gateway           │
                    │   (Kong / Apigee)       │
                    │   Auth, Rate Limit      │
                    └────────┬────────────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
┌───────▼────────┐  ┌────────▼─────────┐  ┌─────▼──────────┐
│ Domain         │  │  Event Bus       │  │ Integration    │
│ Microservices  │◄─┤  (Kafka)         │─►│ Hub            │
│ (Site,         │  │  At-least-once   │  │ (Boomi/Mule)   │
│  Lease,        │  │  delivery        │  │                │
│  Vendor, etc)  │  │  Schema registry │  │ Adapters:      │
└────────┬───────┘  └──────────────────┘  │ • OSS Connector│
         │                                 │ • ERP Connector│
         │                                 │ • CRM Connector│
         │                                 │ • GIS Connector│
┌────────▼───────┐                         │ • DocMgmt Conn │
│ Persistence    │                         └────────┬───────┘
│ Layer          │                                  │
│ • PostgreSQL   │                                  │
│ • Elasticsearch│                          ┌───────▼──────┐
│ • Redis        │                          │ External     │
│ • Object Store │                          │ Systems      │
└────────────────┘                          │ • NMS        │
                                            │ • ERP        │
                                            │ • Atoll etc. │
                                            └──────────────┘
```

**Required Components (NONE currently exist):**

1. **API Gateway** — central auth, rate limiting, observability
2. **Domain Microservices** — Site, Lease, Vendor, Design, etc. as separate services
3. **Event Bus (Kafka)** — at-least-once delivery, schema registry, replay
4. **Integration Hub** — Boomi, MuleSoft, or Apache Camel for adapter orchestration
5. **Adapter Layer** — typed connectors per external system with circuit breakers, retries, DLQ
6. **Persistence Layer** — relational + search + cache + object store
7. **Identity & Access** — OIDC/SAML/SCIM with proper claim mapping
8. **Observability** — distributed tracing (OpenTelemetry), metrics (Prometheus), logging (ELK)

---

## TM Forum Open API Alignment

The Telecom industry has standardized via **TM Forum Open APIs**. The platform should adopt:

| TMF API | Purpose | Implementation |
|---|---|---|
| TMF638 — Service Inventory | Site/cell/sector inventory | None yet |
| TMF642 — Alarm Management | Alarm feed from NMS | None yet |
| TMF622 — Product Ordering | Service activation | None yet |
| TMF629 — Customer Management | Operator master data | None yet |
| TMF648 — Quote Management | Vendor quotes | None yet |
| TMF652 — Resource Function Activation | Network function deployment | None yet |
| TMF663 — Shopping Cart | Vendor ordering | None yet |
| TMF666 — Account Management | Operator accounts | None yet |
| TMF669 — Party Role | Operator/vendor roles | None yet |
| TMF671 — Promotion | Vendor catalog | None yet |
| TMF673 — Geographic Address | Site address normalization | None yet |
| TMF674 — Geographic Site | Site location data | None yet |
| TMF680 — Quote | Same as 648 | None yet |
| TMF688 — Event Management | Event distribution | None yet |
| TMF699 — Sales Lead | Acquisition handoff | None yet |
| TMF701 — Process Flow | Workflow management | None yet |

**Recommendation:** Adopt TMF Open API SUITE as the canonical interface schema. This unlocks integration with any operator's existing TMF-aligned systems and signals enterprise readiness.

---

## Integration Implementation Roadmap

### Phase 1: Foundation (Months 1-6)
1. **Build API Gateway** (Kong or Apigee)
2. **Domain decomposition** — extract Site, Lease, Vendor microservices
3. **Persistence migration** — PostgreSQL replacing MockDB
4. **Identity** — OIDC + SAML + SCIM
5. **Observability** — OpenTelemetry, Prometheus, ELK
6. **Define API contracts** — OpenAPI 3.0 for all internal APIs

**Outcome:** Real backend exists; mock layer eliminated.

### Phase 2: Event Backbone (Months 6-9)
1. **Deploy Kafka cluster**
2. **Schema registry** (Confluent Schema Registry)
3. **Event-driven choreography** between microservices
4. **Outbox pattern** for guaranteed delivery
5. **CDC** (Change Data Capture) for downstream consumers

**Outcome:** Cross-module events flow; modules become loosely coupled.

### Phase 3: TMF Alignment (Months 9-12)
1. **Wrap APIs in TMF Open API schemas**
2. **TMF638** — Service Inventory (sites, sectors, cells)
3. **TMF642** — Alarm Management (NMS feeds)
4. **TMF622** — Product Ordering (service activation)
5. **TMF688** — Event Management

**Outcome:** Industry-standard interface; any operator can integrate.

### Phase 4: First Integrations (Months 12-15)
1. **Ericsson ENM adapter** — NETCONF/YANG inventory + alarm
2. **SAP ERP adapter** — PO/GRN/Invoice flow
3. **Atoll adapter** — RF design round-trip
4. **Esri ArcGIS adapter** — GIS layer sync

**Outcome:** Platform participates in real operator ecosystem.

### Phase 5: Scale Out (Months 15-24)
1. **Nokia, Huawei, Mavenir adapters**
2. **ClickSoftware/ServiceNow FSM adapter**
3. **SharePoint/M365 adapter**
4. **DocuSign for e-signature**
5. **Regulator adapters** (FCC ULS, FAA OE/AAA)

**Outcome:** Tier-1 operator deployment ready.

---

## Implementation Cost

| Phase | Duration | Engineering Effort | Cost Estimate |
|---|---|---|---|
| 1: Foundation | 6 months | 8 engineers | $1.5M |
| 2: Event Backbone | 3 months | 6 engineers | $600K |
| 3: TMF Alignment | 3 months | 4 engineers | $400K |
| 4: First Integrations | 3 months | 6 engineers | $600K |
| 5: Scale Out | 9 months | 10 engineers | $2.5M |
| **TOTAL** | **24 months** | **6-10 engineers** | **$5.6M** |

---

## Bottom Line

Tier-1 operators (Verizon, Vodafone, Orange) will not deploy a rollout platform without TMF-aligned API surface and real adapters for their OSS/BSS/ERP. The current platform has **zero substantive integration work**.

To pass an enterprise integration review:
- **Replace MockDB with real backend** (foundational)
- **Adopt TMF Open APIs** (industry expectation)
- **Build first 5 critical adapters** (Ericsson/SAP/Atoll/ArcGIS/Okta)
- **Demonstrate end-to-end flow** through real systems

This is a **$5-6M, 24-month effort.** No shortcuts available.
