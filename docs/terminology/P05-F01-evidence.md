# P05-F01 local engineering evidence — 2026-11-03

Implemented controlled code-system storage as an additive schema-44 vertical slice: immutable organization-scoped release metadata, version/edition/effective dates, source provenance, synthetic concept pins, content-rights restriction, manifest digest, idempotent registration, audit/outbox atomicity, permission checks, JSON API, searchable registry and release detail, and mobile web handoff.

## Observed checks

| Command or check | Observed result | Evidence |
| --- | --- | --- |
| npm test | 402 passed, 0 failed | artifacts/governance-v2/P05-F01-domain-final.log |
| npm run build with CURASPHERE_NEXT_DIST=.next-p04f05-build | Exit 0 | artifacts/governance-v2/P05-F01-build.log |
| npm run typecheck and npm run typecheck --prefix apps/mobile | Exit 0 | artifacts/governance-v2/P05-F01-typecheck.log |
| npm run lint | Exit 0 | artifacts/governance-v2/P05-F01-lint.log |
| npm run governance:test | 10 passed | artifacts/governance-v2/P05-F01-governance.log |
| npm run governance:v2:test | 16 passed | artifacts/governance-v2/P05-F01-governance.log |
| Existing P04-F05, premium UI and workspace polish browser suites | All 7 passed against schema 44 | artifacts/governance-v2/P05-F01-browser.log |
| Terminology browser suite after correcting restricted-content test expectation | 3 passed | artifacts/governance-v2/P05-F01-registry-browser.log |
| Final terminology browser run including desktop/mobile screenshots and 390px overflow check | 3 passed | artifacts/governance-v2/P05-F01-registry-browser-final.log |
| Working database migration | Version 44; 21 existing patients retained | Local SQLite query after startup |

Domain scenarios include disk reopen, immutable release metadata and sealed pins, idempotent retry/conflict, tenant/role/suspended-account restrictions, official-content rejection, unknown/expired-code rejection, malformed dates and provenance URLs, forced outbox transaction rollback, access-ledger integrity, schema-43 upgrade, injected migration failure and recovery, dependency outage and production gate denial.

Browser scenarios exercise real persisted registrations and actual sessions: administrator form submission, accessible release provenance, clinician read-only view and write denial, anonymous and foreign-Origin requests, malformed JSON, unknown lookup, replay/conflict, successful synthetic lookup, official-content denial, and foreign-organization isolation. No terminology API mocks are used.

Regression repair: older rollback tests must remove the new schema-44 fixture extension before simulating an earlier downgrade. Their original historical version assertions remain intact. The operational rollback retains data; the fixture-only teardown is not a deployment procedure.

The initial combined browser run reported 9 passes and one terminology failure because its loaded test expected 422 for an official-content import; the implementation correctly returned 403. The corrected test was rerun successfully. This initial failure remains in the artifact log; it is not overwritten or counted as passing.

## Review boundary and remaining work

Automated engineering verification is not formal acceptance. No independent human clinical/regulatory/licensing review has been recorded. Phase 02 reviews remain pending; protected formal registers and prior governance records are unchanged. The historical governance runner still covers its original authorization and does not accept Phase 05.

Official SNOMED/LOINC/ICD/UCUM content is not imported or enabled; metadata registration does not grant entitlement. P05-F02 through P05-F05 remain unimplemented. Code/unit validation and clinical version integration, mapping adjudication, facility catalogs/formularies and conformance UX remain later features. Do not advance past the feature review gate by treating this document as a human approval.

Local app: http://127.0.0.1:3000/terminology. Mobile exposes a registry web handoff for permitted staff, with separate browser sign-in. Production clinical functions remain disabled. Changes are uncommitted; no push, merge, publish or deployment was performed.
