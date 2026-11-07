# Phase 09 Evidence Graph closeout

Formal acceptance is blocked pending qualified review. Local synthetic engineering is complete. The [experimental register](phase-09-experimental-register.json) records the individual feature status and review gates.

| Feature | Delivered scope | Verification |
| --- | --- | --- |
| P09-F01 | Typed, immutable claim revisions and direct citations in schema 58. Claims workspace and API. | [Claim validation](P09-F01-validation.md) |
| P09-F02 | Schema 59 adds scoped document imports, immutable annotated relationships, and command receipts. Timeline, FHIR R4, and document source inspection. | [Ingestion validation](P09-F02-validation.md) |
| P09-F03 | Versioned local rules flag insufficient evidence without changing a claim’s unverified state. | [Policy evidence](P09-F03-plan.md) |
| P09-F04 | Authorized reads recheck citations and relationships. Changed or missing sources withhold dependent content. | [Invalidation evidence](P09-F04-plan.md) |
| P09-F05 | Claim and relationship filtering, an accessible citation drawer, and equivalent public responses for restricted, stale, and unknown citations. | [Workspace evidence](P09-F05-plan.md) |

## Exit criteria

- Evidence state is explicit for each local claim revision. Schema constraints and domain tests reject verification and model impersonation. Cross-module generated claims require review at the formal phase gate.
- Source correction and isolated document removal withhold all tested dependent claims. The browser correction scenario covers both a direct citation and an annotated relationship. A clinician can append a new revision after source review.
- Source permissions govern claim and citation access. Scope and revoked-permission tests cover patient, tenant, facility, owner, and purpose. The browser probe verified matching 404 responses for restricted and unknown citations.

## Operations and pending decisions

The closeout rerun passed all 32 tests using `node --import tsx --test packages/domain/test/evidence-graph.test.ts packages/domain/test/evidence-ingestion.test.ts`. The feature reports record the build, lint, and browser runs.

The web entry points are the patient Evidence claims and Evidence sources pages. Their APIs are `/api/evidence/claims` and `/api/evidence/sources`. The source ingestion event is `evidence.source.recorded`.

The local browser rechecks claims every 30 seconds and sources every 60 seconds while available. These intervals describe refresh behavior. Production latency and invalidation targets await qualified review. The migration 58 to 59 failure and retry passed on an isolated database. Operational rollback retains schema 59 and immutable history. The [operations notes](P09-F02-operations.md) describe the schema-compatible rollback path.

Outstanding decisions include prerequisite acceptance, clinical policy thresholds, privacy and retention treatment of imported documents, architecture and licensing reviews, and formal release approval. Production clinical functionality remains disabled.

The next proposed feature is P10-F01, provider abstraction. The Phase 09 specification requires explicit permission before Phase 10 starts.
