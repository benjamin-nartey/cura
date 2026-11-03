# Phase 05 implementation plan

Status: PLAN_ONLY. No Phase 05 code or formal phase acceptance is authorized by this document. It follows completion of authorized Phase 04 experimental engineering and remains bounded by the explicit engineering scope.

Source: `CuraSphere_Cursor_Pack/phase-specs/PHASE_05_terminology-master-data.md`. Required outcomes are safe rejection of unknown codes, recorded terminology versions on clinical records, and visible mapping provenance.

Inventory before implementation: existing `terminology.ts`, `fhir-map.ts`, source catalogs in `clinical-source.ts`, billing catalog versions, facility terminology pins, schema migration head, existing contracts and terminology tests. Extend ownership rather than duplicating code systems or patient models.

1. P05-F01: controlled versioned code-system metadata and licensed content/provenance. Document licenses and distribution rights; use clearly synthetic local concepts while licensing is unresolved. No silent SNOMED/LOINC/ICD imports.
2. P05-F02: code/value-set validation and canonical units; dimension checks, explicit unknown/ambiguous failures, deterministic rounding.
3. P05-F03: mapping provenance/adjudication with source/target versions and equivalence; ambiguous or consequential mappings remain human-controlled.
4. P05-F04: facility formulary/catalog versions and safe overrides; archived clinical and billing source versions remain reconstructable.
5. P05-F05: coded selectors, provenance/version/error UX and representative write conformance.

Conservative class C when a feature affects authoritative clinical coding or medication/catalog workflows; pure internal metadata tooling can be A only if its actual capability is isolated. FDA/HIPAA applicability remains deployment-specific. Each feature needs a specification, threat/hazard review, additive migration/recovery, backend/UI/security slice, two-tenant synthetic fixture, unknown-code and mismatched-unit oracles, real tests, accessibility, audit, monitoring and documentation.

Add these features to an explicitly authorized engineering scope before the runner can implement them. Their technical progression can then be automatic and sequential, without repetitive internal signatures. Production, external clinical exchange, real medication execution and regulated functions retain their separate requirements.
