# Vision and Product Principles

CuraSphere is an AI-native global healthcare operating platform. Its core is not a chatbot layered over an EHR; it is a governed intelligence fabric built around Patient Twin, Facility Twin, Population Intelligence, an Evidence Graph, an Agent Platform, and standards-based interoperability. The system must preserve clinical source-of-truth data, keep human clinicians in control of consequential clinical actions, and make every important AI output traceable, reviewable, versioned, and measurable.

## Non-negotiable principles
- Clinical source data is authoritative; twins, summaries, scores and AI outputs are derived artifacts.
- No consequential clinical action is performed solely because an LLM produced text.
- Every AI output that can affect care carries evidence references, model/version, timestamp, limitations and review state.
- Tenant, facility, purpose-of-use and user authorization are derived server-side and enforced at every data boundary.
- FHIR/DICOM/terminology mappings are platform primitives, not adapters bolted on at the end.
- Regulated and non-regulated capabilities are separated by intended use, release train, quality controls and telemetry.
- Offline and low-bandwidth operation are first-class product modes for target markets that need them.
- AI providers are interchangeable behind a policy-aware model gateway; no core workflow depends on one vendor.
- All long-running or externally dependent workflows are durable, idempotent and observable.
- No phase is complete until security, privacy, reliability, observability, rollback and documentation criteria pass.