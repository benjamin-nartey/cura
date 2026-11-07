# ADR-0075 — Boundary-specific published conformance

Status: locally implemented and technically verified; qualified review pending.

Describe the legacy cookie chart API and current-source patient-scoped SMART read API separately. Do not advertise source-only profiles on the stripped SMART projection or represent signed partner envelopes, reviewed batches and local delivery lifecycle as FHIR transaction/SubscriptionTopic/Bulk Data endpoints. Publish a separate explicit custom-contract catalog.

Use pure versioned factories in the FHIR package, shared by runtime metadata, generated validation fixtures and contract tests. Publish the existing draft profiles through a whitelist of bundled generated artifacts; canonical identifiers remain distinct from deployment download URLs. Metadata is PHI-free and local-gated, with fixed configured origin and deterministic hashes. No new database is justified.

R4 remains 4.0.1. Explicit incompatible version/format requests fail; no implicit R5 downgrade or conversion is introduced. R5 work is a documented future adapter/validation plan and requires qualified reviews before production. Stop at the Phase 06 boundary after technical verification.
