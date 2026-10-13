# CuraSphere Engineering Specification Pack v1.0

## Product thesis
CuraSphere is an AI-native global healthcare operating platform. Its core is not a chatbot layered over an EHR; it is a governed intelligence fabric built around Patient Twin, Facility Twin, Population Intelligence, an Evidence Graph, an Agent Platform, and standards-based interoperability. The system must preserve clinical source-of-truth data, keep human clinicians in control of consequential clinical actions, and make every important AI output traceable, reviewable, versioned, and measurable.

## How to use this pack
1. Phase 0 is mandatory before code.
2. Execute one implementation phase at a time.
3. Every phase begins with an RFC and risk review.
4. Every phase ends with verification, observability, rollback and documentation evidence.
5. Regulated clinical AI follows the dedicated regulated release train.

## Documentation map
- `01-product/` product strategy and requirements
- `02-architecture/` system/data/integration/cloud architecture
- `03-clinical/` clinical safety and intended-use governance
- `04-ai-ml/` AI platform, agents, evaluation and MLOps
- `05-engineering/` SDLC, repository, API, testing and release standards
- `06-security-privacy/` zero trust, privacy, audit and incident response
- `07-regulatory/` jurisdiction and quality-system approach
- `08-implementation/` executable phase specifications

This pack is a product and engineering blueprint, not legal or medical advice. Jurisdiction-specific regulatory classification must be confirmed by qualified regulatory/legal professionals before commercial deployment.

## Local foundation

A runnable slice sits beside the blueprint. It covers the constitution records, the monorepo, server-derived facility context, attributable audit, core chart writes, a deterministic timeline, a facility terminology pin, a FHIR R4 projection, a rebuildable patient state, evidence citations for derived lines, a model gateway that refuses generation, an agent runtime that parks for human approval, a copilot that repeats supported claims, documentation drafts that are not signed, lab orders whose critical flags come from a pinned rule, medication warnings that stay in place until a person acknowledges them, and outreach that stores a localized template only after consent. The clinician workspace uses the teal and slate system documented in `DESIGN.md`. There is no model in the request path.

```bash
npm install
npm test
npm run dev
```

The workforce directory is served by the Kotlin foundation on the local PostgreSQL database. Copy `services/foundation/env.example` to `services/foundation/.env`, set the local role password, then start it beside the web app:

```bash
bash services/foundation/run.sh bootRun
```

Open http://localhost:3000 and choose a directory identity. Patients use http://localhost:3000/portal. The mobile clinic app is separate:

```bash
npm run mobile
```

On this computer it uses `http://127.0.0.1:8081`. On a phone, set the foundation address to this computer's LAN address. The directory has no passwords and is refused when `CURASPHERE_ENV=production`. The workforce session is the PostgreSQL row. The timeline reads the foundation database when that service is running, and `data/curasphere.sqlite` when it is not. A booked visit is stored in both. A lab order is stored in the foundation service, then copied to the clinic record. A specimen is stored against that order the same way. A lab result is stored in the foundation service, then copied to the clinic record. Acknowledgement of a critical lab alert is stored in the foundation service, then copied to the clinic record. The critical flag stays on the result. A proposed prescription is stored in the foundation service, then copied to the clinic record. Recording that prescription stores the medication in the foundation service and marks the foundation order active. A dispense is stored in the foundation service, then copied to the clinic record. An administration is stored in the foundation service, then copied to the clinic record. Acknowledgement of a warning is stored in the foundation service, then copied to the clinic record. Its severity is unchanged. Nothing was billed. A typed device reading is stored in the foundation service and copied onto the clinic observation list. A reading that exists only as a device row stays on the SQLite timeline and the patient record. Do not enter real patient information.

Decisions and rollback: `docs/adr/ADR-0001-foundation-runtime.md`, `docs/adr/ADR-0002-fhir-r4.md`, `docs/adr/ADR-0003-timeline-projection.md`, `docs/adr/ADR-0004-patient-state.md`, `docs/adr/ADR-0005-evidence-graph.md`, `docs/adr/ADR-0006-ai-gateway.md`, `docs/adr/ADR-0007-agent-runtime.md`, `docs/adr/ADR-0008-clinical-copilot.md`, `docs/adr/ADR-0009-clinical-documentation.md`, `docs/adr/ADR-0010-curalab.md`, `docs/adr/ADR-0011-curarx.md`, `docs/adr/ADR-0012-care-coordination.md`, `docs/adr/ADR-0013-patient-record.md`, `docs/adr/ADR-0014-facility-twin.md`, `docs/adr/ADR-0015-operations-intelligence.md`, `docs/adr/ADR-0016-analytics-lakehouse.md`, `docs/adr/ADR-0017-population-intelligence.md`, `docs/adr/ADR-0018-curaresearch.md`, `docs/adr/ADR-0019-imaging-dicom.md`, `docs/adr/ADR-0020-devices.md`, `docs/adr/ADR-0021-revenue.md`, `docs/adr/ADR-0022-evaluation.md`, `docs/adr/ADR-0023-enterprise.md`, `docs/adr/ADR-0024-marketplace.md`, `docs/adr/ADR-0025-release-train.md`, `docs/adr/ADR-0026-modules.md`, `docs/adr/ADR-0027-foundation-extraction.md`, `docs/adr/ADR-0028-workforce-session.md`, `docs/adr/ADR-0029-patient-registry.md`, `docs/adr/ADR-0030-encounters.md`, `docs/adr/ADR-0031-observations.md`, `docs/adr/ADR-0032-chart-core.md`, `docs/adr/ADR-0033-mobile-clinic.md`, `docs/adr/ADR-0034-timeline-read.md`, `docs/adr/ADR-0035-appointment-writer.md`, `docs/adr/ADR-0036-chart-writers.md`, `docs/adr/ADR-0037-fhir-observation.md`, `docs/adr/ADR-0038-device-reading.md`, `docs/adr/ADR-0039-device-observation.md`, `docs/adr/ADR-0040-lab-order.md`, `docs/adr/ADR-0041-lab-specimen.md`, `docs/adr/ADR-0042-lab-result.md`, `docs/adr/ADR-0043-prescription.md`, `docs/adr/ADR-0044-prescription-recorded.md`, `docs/adr/ADR-0045-prescription-dispense.md`, `docs/adr/ADR-0046-prescription-administration.md`, `docs/adr/ADR-0047-prescription-acknowledgement.md`, `docs/adr/ADR-0048-lab-alert-acknowledgement.md`, `docs/rfc/RFC-0001-platform-foundation.md`, `docs/rfc/RFC-0003-fhir-r4.md`, `docs/rfc/RFC-0004-clinical-timeline.md`, `docs/rfc/RFC-0005-patient-state.md`, `docs/rfc/RFC-0006-evidence.md`, `docs/rfc/RFC-0007-ai-gateway.md`, `docs/rfc/RFC-0008-agent-runtime.md`, `docs/rfc/RFC-0009-clinical-copilot.md`, `docs/rfc/RFC-0010-clinical-documentation.md`, `docs/rfc/RFC-0011-curalab.md`, `docs/rfc/RFC-0012-curarx.md`, `docs/rfc/RFC-0013-care-coordination.md`, `docs/rfc/RFC-0014-patient-record.md`, `docs/rfc/RFC-0015-facility-twin.md`, `docs/rfc/RFC-0016-operations-intelligence.md`, `docs/rfc/RFC-0017-analytics-lakehouse.md`, `docs/rfc/RFC-0018-population-intelligence.md`, `docs/rfc/RFC-0019-curaresearch.md`, `docs/rfc/RFC-0020-imaging-dicom.md`, `docs/rfc/RFC-0021-devices.md`, `docs/rfc/RFC-0022-revenue.md`, `docs/rfc/RFC-0023-evaluation.md`, `docs/rfc/RFC-0024-enterprise.md`, `docs/rfc/RFC-0025-marketplace.md`, `docs/rfc/RFC-0026-release-train.md`, `docs/rfc/RFC-0027-modules.md`, `docs/rfc/RFC-0028-foundation-extraction.md`, `docs/runbooks/foundation.md`.
