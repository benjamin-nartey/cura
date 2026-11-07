# P06-F05 engineering evidence

Local synthetic implementation, 2026-11-04. Qualified reviews remain pending; formal Phase 06 is NOT_STARTED and production clinical functionality is disabled.

## Delivered behavior

Two independent R4 CapabilityStatements describe the existing legacy chart and current-source scoped read interfaces. Eight existing draft profiles and two custom OperationDefinitions are published as twelve whitelisted, versioned artifacts with exact-byte SHA-256 hashes and conditional ETags. The public local catalog contains no patient, client, grant, tenant or session facts. The staff workbench provides actual API-backed previews/downloads, support limits, discovery links and explicit R5 planning context.

Shared factories drive runtime metadata, generated fixtures and drift checks. Source bearer reads do not falsely assert the private source profile. Custom partner transport/batches remain documented custom contracts. Explicit incompatible R5/R4B/XML negotiation fails on R4 routes; default JSON and legacy NDJSON polling remain supported. No schema migration or clinical write is introduced by conformance publication.

See [architecture/runbook](P06-F05-architecture-and-operations.md), [risk controls](P06-F05-risks.md), [R5 compatibility plan](P06-F05-R5-compatibility-plan.md) and [ADR-0075](../adr/ADR-0075-boundary-specific-published-conformance.md).

## Observed checks

Artifacts below are under `artifacts/governance-v2/` and retained locally, independently of earlier feature evidence.

| Check | Actual result and evidence |
| --- | --- |
| Full domain suite | 494 pass, zero failures — `P06-F05-domain.log` |
| Conformance generation and contracts | Eight pass, including four domain cases already counted above; generated artifacts match — `P06-F05-conformance.log` |
| New live web scenarios | Two pass: all twelve artifact byte hashes/304s, unsupported formats/versions, staff previews, Axe, 390-pixel containment, actual registration/PKCE approval/token/all seven scoped reads/revocation — `P06-F05-browser.log`, `.json` |
| Existing web regressions | All seventeen distinct scenarios pass: sixteen in the broad run and the reconciliation scenario on an isolated rerun after a GET ECONNRESET; failed trace retained — `P06-F05-regressions-verified.log`, `.json`, `P06-F05-recovery-recheck.log`, `.json` |
| Mobile browser/API | Four pass, including actual Metro workspace, persisted clinical data, role/CORS boundaries, Axe, error recovery and sign-out — `P06-F05-mobile.log`, `P06-F05-mobile/` |
| Transport/receiver | Four HTTP/receiver tests pass, including shipped receiver process restart — `P06-F05-transport.log` |
| Governance | 16 v2 + 10 local/review tests pass — `P06-F05-governance.log`, `P06-F05-governance-local.log` |
| Types/build/lint | Contracts/domain/FHIR/web and separate mobile types, optimized web build and lint pass — `P06-F05-types.log`, `P06-F05-mobile-types.log`, `P06-F05-build.log`, `P06-F05-lint.log` |
| Official HL7 validator | All eleven expected outcomes pass — `P06-F05-validator/summary.json` and raw reports |

The first broad browser invocation used the runner's default port 3105 instead of the running app at 3000. That configuration failure remains in `P06-F05-regressions.log`; the corrected run uses explicit CURASPHERE_E2E_BASE_URL and a separate report. The separate connection-reset failure did not reproduce in the isolated recovery run (one pass); no retry loop or application code change was added. No application code changed to conceal either result. Earlier tracked report bytes were restored. Existing shared mobile screenshots were archived and restored after capturing this run separately.

## Official validation scope

Validator 7.0.4, pinned SHA-256 `43e29fa8822d670740a909c395ca5b70a3d07fbaa8936f8dedc6a98b007f555b`, R4 4.0.1, Java 21. Nine valid fixtures have zero errors; two intentional negatives each have one error. Warnings: patient 1; source roundtrip 18; source lifecycle 20; delegated app bundle 18; partner export 8; each new CapabilityStatement/OperationDefinition 1. Expected negatives retain 1 and 2 warnings respectively. All raw warnings remain visible. Terminology server is explicitly disabled (`-tx n/a`); this is structural/profile validation, not terminology licensing, clinical approval or certification.

CI now checks conformance drift/contracts and retains this expanded official-validator run directory. No remote CI execution is claimed for uncommitted work.

## Preservation and phase boundary

The consistent pre-feature snapshot is `P06-F05-before.sqlite`. Original primary keys (including compound keys) and all original column values are compared across 26 clinical/provenance/SMART/integration/batch tables; new synthetic regression rows remain in place. Final `P06-F05-preservation.json` confirms schema 51 → 51 and zero missing/changed original rows across all 26 tables. `P06-F05-operational-cleanup.json` confirms three ended subscriptions, seven disabled connections and one disabled conformance client. The cleanup harness initially retained a doctor cookie during its admin sign-in; clearing cookies between identities completed cleanup without changing application code. Both cleanup logs remain retained. Temporary test subscriptions/connections are ended/disabled through the actual authorized APIs; no clinical records are deleted. Generated Next config files are restored to their captured starting hashes after checks.

This completes the conformance publication and R5 planning scope only. R5 conversion remains future work. Formal prerequisite and qualified reviews remain pending. See [Phase 06 engineering exit report](phase-06-engineering-exit-report.md). Stop before P07-F01. No commit, push, merge, publication or deployment was performed.
