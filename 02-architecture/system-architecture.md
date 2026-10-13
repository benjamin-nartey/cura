# System Architecture

CuraSphere is an AI-native global healthcare operating platform. Its core is not a chatbot layered over an EHR; it is a governed intelligence fabric built around Patient Twin, Facility Twin, Population Intelligence, an Evidence Graph, an Agent Platform, and standards-based interoperability. The system must preserve clinical source-of-truth data, keep human clinicians in control of consequential clinical actions, and make every important AI output traceable, reviewable, versioned, and measurable.

## Logical layers

1. Experience: clinician/admin web, patient mobile, partner apps.
2. Edge and identity: gateway, WAF, auth, tenant/purpose policy.
3. Healthcare services: patient, encounter, orders, meds, labs, care, billing.
4. Workflow: Temporal and event-driven processes.
5. Intelligence: patient/facility/population twins, evidence graph, AI gateway and agents.
6. Interoperability: FHIR, SMART, DICOMweb, device and payer adapters.
7. Data: Postgres, object storage, Kafka, search, lakehouse.
8. Control plane: model registry, prompts, policies, feature flags, configuration, billing and metering.
9. Reliability/security plane: telemetry, audit, SIEM, backup, DR, key management.

## Technology decisions

- **Web applications:** React + Next.js + TypeScript — Mature ecosystem, server/client rendering, enterprise UI, strong hiring market; use a shared design system and accessibility baseline.
- **Mobile:** React Native + TypeScript — Shared talent and domain packages with web while retaining native integrations; native modules remain possible for medical-device integrations.
- **Core transactional services:** Kotlin + Spring Boot — Strong typing, mature security and enterprise ecosystem, long-term maintainability for healthcare workflows and integration-heavy services.
- **Edge/API gateway:** Envoy + Kubernetes Gateway API — Standards-based traffic management, mTLS, rate limits, policy enforcement and multi-cluster routing.
- **AI/ML services:** Python + FastAPI/gRPC + PyTorch — Best-in-class ML ecosystem; isolated from transactional services behind versioned contracts.
- **Workflow orchestration:** Temporal — Durable, resumable workflows for long-running clinical/admin processes, approvals, retries, timers and agent executions.
- **Event streaming:** Apache Kafka — Durable event backbone for clinical events, analytics, integrations, model monitoring and asynchronous workflows.
- **Transactional database:** PostgreSQL — Strong relational integrity, JSON support, RLS options, broad ecosystem; partitioning and read replicas as scale grows.
- **Vector search:** pgvector initially; dedicated vector service only when justified — Keeps early architecture simpler and transactional/evidence linkage close to source data.
- **Cache:** Redis — Ephemeral caching, rate limiting, distributed coordination; never authoritative clinical storage.
- **Object storage:** S3-compatible object storage — Encrypted documents, images, DICOM payloads, model artifacts, exports and immutable audit evidence.
- **Search:** OpenSearch — Full-text search, operational search and log/search workloads; isolate PHI-aware indexes.
- **Analytics lakehouse:** Apache Iceberg on object storage + Trino/Spark — Cloud-neutral analytical storage with schema evolution and scalable secondary-use analytics.
- **Observability:** OpenTelemetry + Prometheus + Grafana + Sentry — Vendor-neutral traces/metrics/logs, SLO measurement and application error telemetry.
- **Infrastructure:** Kubernetes + Terraform/OpenTofu + Helm — Portable deployment model with policy-as-code, repeatable environments and multi-region evolution.
- **Secrets and keys:** Cloud KMS/HSM + Vault-compatible interface — Envelope encryption, tenant/region key policies, rotation and auditable secrets lifecycle.
- **Identity:** OIDC/OAuth 2.1 + FIDO2/WebAuthn; enterprise SAML federation — Standards-based workforce/patient identity, MFA/passkeys and enterprise federation.
- **Healthcare interoperability:** HL7 FHIR R4 baseline + R5 compatibility, SMART on FHIR, DICOM/DICOMweb — Global compatibility while supporting the installed base of R4 ecosystems and newer R5 capabilities.
- **Clinical terminology:** SNOMED CT, LOINC, ICD-10/ICD-11 mapping, UCUM, local formularies — Terminology service prevents uncontrolled strings and supports localization/regulatory reporting.
- **Feature delivery:** GitHub Actions + Argo CD + progressive delivery — Automated policy/test gates, declarative deployments, canary/shadow releases and rapid rollback.