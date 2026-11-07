# P06-F05 — Published conformance and R5 plan

Local synthetic authority only. Preserve all F01–F04 code/evidence and formal Phase 06 NOT_STARTED. Complete this final feature, issue a phase engineering exit report and stop before Phase 07.

Publish versioned R4 CapabilityStatements for the separate legacy chart and current-source SMART read boundaries, the eight existing draft profiles, exact custom legacy OperationDefinitions, and a machine-readable catalog describing preview/partner/batch/recovery contracts without falsely declaring them generic FHIR REST or HL7 Bulk Data. Correct stale blanket SMART/webhook wording while preserving legacy behavior. Generated artifacts and served descriptors must share one implementation and have drift checks.

Publish a staff-readable conformance workbench backed by the actual readonly APIs, downloads and explicit support/restriction matrices. Metadata contains no patient/client/grant/session/tenant details and can be anonymously retrieved in the gated local environment. Unsafe deployment flags fail closed. New conformance endpoints use configured loopback origin, never an untrusted Host to form URLs. No database migration or clinical write is needed; version-controlled generated artifacts are authoritative for this feature.

Reject explicit R5/R4B/XML negotiation on R4 FHIR interfaces instead of silently relabeling R4. Preserve default JSON clients. Document resource-specific R5 migration deltas, unknown-field/loss restrictions, identity/version/terminology/safety invariants and a staged validation/review plan; do not implement or claim an R5 adapter.

Verify declarations against actual route handlers and actual requests (including SMART scoped reads, denied unsupported operations, published profile hashes and version errors). Run official HL7 validation on both statements/operations and prior fixtures, negative cases and all relevant regression suites. Preserve earlier validator evidence in separate run directories. CI must check generated artifacts and conformance contracts; local results are not a claim of remote CI success or certification. Record security, operational rollback and pending qualified reviews separately.
