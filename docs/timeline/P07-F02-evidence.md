# P07-F02 — Materialization and rebuild evidence

Local synthetic engineering, 2026-11-04. Formal Phase 07 remains NOT_STARTED; qualified reviews are pending and production clinical functions are disabled.

## Delivered scope

Schema 52 installs a transactional source-version outbox, derived canonical-event cache and immutable scoped command receipts. Triggers enqueue all four F01 source families and migration backfills retained versions. Existing source rows/ledger remain authoritative. The consumer handles up to 50 pointers per transaction with source-version/predecessor ordering, exact deterministic event identity, duplicate suppression and durable dead-letter diagnostics. Atomic rebuild validates source first, replaces only permitted derived families and retains quarantine resolution evidence. A killed consumer rolls back its entire uncommitted batch.

The actual authenticated projection API and staff chart panel support status/queue/dead-letter inspection, bounded processing, rebuild, matched hashes and materialized previews. Cached facts are returned only after current canonical authorization and exact source matching; otherwise events=[] with stale metadata. Existing source timeline stays separate and available. The shipped executable worker actually resolves its original Foundation identity and performs one bounded pass. No Kafka deployment, automatic daemon, clinical mutation or generated fact is claimed.

Paths: `packages/domain/src/timeline-projection-schema.ts`, `timeline-projection.ts`, migration in `db.ts`; `/api/clinical-timeline/projection`; `apps/web/components/timeline-projection.tsx`; `tools/timeline/worker.ts`. New focused tests and actual-process helper are in `packages/domain/test/timeline-projection*.ts`; browser tests are `tools/e2e/p07-f02.spec.ts`.

## Observed verification

Artifacts below are under `artifacts/governance-v2/`.

| Executed check | Actual result |
| --- | --- |
| `npm test` | 517 pass, zero failures — `P07-F02-domain-final.log` |
| Canonical + projection focused suites | 23 pass (11 prior canonical + 12 new materialization, overlapping the full suite), including actual competing processes and SIGKILL/reopen — `P07-F02-focused-complete.log` |
| P07-F01 + P07-F02 live browser | Six pass on final build, including actual worker process/Foundation identity, hashes, replay/rebuild, 409 collision, UI persistence/error recovery, Axe and phone containment — `P07-F02-browser-final.log`, `.json` |
| Actual Metro mobile/browser/API | Four pass — `P07-F02-mobile.log`, separate `P07-F02-mobile/` evidence |
| Conformance contracts/drift | Eight pass — `P07-F02-conformance.log` |
| Governance | 16 v2 + 10 local/review pass — `P07-F02-governance.log`, `P07-F02-governance-local.log` |
| Types | Full contracts/domain/FHIR/web and mobile pass — `P07-F02-types-complete.log`, `P07-F02-mobile-types.log`; final domain check after test-harness updates in `P07-F02-domain-types-final.log` |
| Lint | Full scoped lint passes — `P07-F02-lint-complete.log` |
| Optimized build | Pass — `P07-F02-build-verified.log` |
| Original-row preservation | Schema 51→52; all original primary keys and column values unchanged across 28 clinical/provenance/SMART/integration/batch/component/appointment tables — `P07-F02-preservation.json` |

Screens: `P07-F02/materialization-desktop.png`, `materialization-phone.png`. Shared F01/mobile screenshot directories were backed up and restored, with run-specific copies archived separately. No prior validator evidence or historical acceptance record was overwritten. Final generated Next config files are restored to their captured starting hashes.

## Reproducible oracles

1. Every actual source-version commit enqueues one pointer. A deliberately failing queue trigger rolls back the attempted clinical correction and source history. No queue-only success exists.
2. A two-item page leaves a visibly stale incomplete cache; subsequent bounded processing exactly matches canonical event bytes/hash. Same command key replays one outcome; conflicting semantics fail. Two rebuild commands produce the same hash and one derived event per source version.
3. Physically reversed queue order and an actual correction still project predecessor versions first, preserve old source values and maintain accurate historical badges. Redelivery does not duplicate derived events.
4. Invalid pointer contract enters durable quarantine and returns no cached clinical events as fresh. Source-validated rebuild restores exact projection while retaining original diagnostic and resolving run ID; no quarantined clinical payload is imported.
5. New source correction immediately invalidates old cached bytes. Source dependency downtime advances no command/queue checkpoint; restoring dependency resumes the same operation.
6. Tampered/missing cache events are withheld, never served as normal source facts. Rebuild repairs only derived rows.
7. Wrong tenant/facility, administrator/unsupported purpose, revoked session and removed source-kind permission cannot read or rebuild inaccessible facts. Restricted rebuild preserves other stored families.
8. SQL failure after deleting derived rows rolls back the cache deletion, queue status and command receipt together.
9. Failed migration leaves schema 51/source rows intact. Successful reopen installs schema 52 and backfills retained versions.
10. Two actual SQLite processes share a command key: one commits and the other replays; no duplicate cache/run exists.
11. An actual child process is killed after its first uncommitted cache insert. Reopening the file shows no partial cache/run and all five jobs pending. Replaying commits a complete matching projection. Fault interception exists only in the test child, not production code.
12. Real HTTP/browser tests exercise body/type/bound/origin/auth/key/tenant denials, actual persisted chart data, reload persistence, repeated rebuild hashes and sanitized error recovery. The real shipped worker is invoked as a child process using its current Foundation session; output contains no session secret.

[Scenario manifest](P07-F02-scenarios.json), [ADR-0077](../adr/ADR-0077-transactional-timeline-materialization.md), [architecture/runbook](P07-F02-architecture-and-operations.md), [risk controls](P07-F02-risks.md), [plan](P07-F02-plan.md).

## Defects and retained failed evidence

The first broad run exposed test-fixture cleanup assumptions after adding source-version foreign keys, plus child-process paths incorrectly relative to the npm workspace. Disposable fixture rollback now removes dependent derived structures, and child paths resolve from import.meta.url. Assertions about source integrity and crash recovery are preserved. New schema-52 expectations and rollback chaining were updated throughout migration tests; no historical observed reports were rewritten.

The first browser run caught a real new API error mapping: conflicting command keys surfaced as 503. The domain now emits the expected 409 conflict; the final browser test proves it. That run also retained temporary Foundation/source-unavailable failures during concurrent heavy checks. After dependencies were healthy and heavy work completed, all six scenarios passed without adding retries or weakening assertions. Earlier logs and traces remain in `P07-F02-domain.log` and `P07-F02-browser-output/`.

A final build initially failed when Windows refused an in-place write to Next's generated type-reference file. Replacing that generated file with the expected reference content allowed the build to pass; application behavior was unchanged. Both build logs remain. Generated files are restored after verification.

## Operations, safety and remaining reviews

No original clinical rows were edited/deleted for migration or cleanup. Queue/cache/run changes are local derived operations; actual source amendments occur only in isolated synthetic test fixtures. The 28-table preservation comparison includes compound keys and original columns. No new official FHIR validator run is claimed: this custom timeline contract does not change R4 resource serialization, and prior Phase 06 validator evidence remains intact. CI's full domain job includes the new tests through the package script; remote CI has not run this uncommitted feature.

Operators explicitly invoke bounded work; there is no unattended privileged session or implicit scheduling. Operational rollback stops new worker/UI invocation and retains source, queue and run evidence; the existing canonical source timeline remains available. Destructive rollback helpers are exclusively for isolated disposable fixtures. Production scheduling, external stream adapters, retention policy deployment and qualified clinical/privacy/architecture/licensing acceptance remain genuine pending work. No simulation result grants those approvals.

P07-F02 local engineering is verified, with no remaining observed feature defect. P07-F03–F05 remain NOT_STARTED. No commit, push, merge, external publication, deployment or production activation was performed.
