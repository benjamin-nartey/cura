# P08-F03 — Conflict and uncertainty evidence

Local synthetic engineering verified 2026-11-05. Formal Phase 08 remains NOT_STARTED. Qualified prerequisite/clinical/privacy/architecture/licensing reviews remain pending; production clinical functions remain disabled. P08-F04 and P08-F05 are unstarted.

## Delivered

Source-review-v1 analyzes current, live-authorized and source-reproduced F02 state without changing twin-source-v1 state bytes or hashes. Positive/no-known allergy assessments, same-concept allergy details, medication draft details, literal condition statuses and equal-time observations stay separately sourced. Unknown allergy, unconfirmed verification, unsupported concept/status and clinical timing remain uncertainty. Inactive/refuted allergy claims do not establish a current positive contradiction. Drafts never establish active therapy. No clinical severity, winner, treatment advice or automatic correction is generated.

Schema 56 adds immutable source-verification requests and scoped command receipts. Requests are actual durable local queue items, exact-source-context scoped and candidate deduplicated. Every reader needs an authorized own current build. The queue reproduces original build digest/candidate/source references and contains metadata rather than copied clinical values or free-text judgments. Source changes hide stale candidates and retain prior requests as open-source-changed; clinical resolution is never automatic. There is no external delivery, reviewer assignment or qualified signoff claim.

Authenticated same-origin no-store GET/POST /api/patient-twin/conflicts and the responsive Twin panel expose exact source assertions, version/recording/clinical times, integrity details, real source-history links, request and refresh actions. Five candidates per page and a type filter bound navigation without dropping sources from selected issues. Loading/not-built/empty/stale/error/cancel/offline behavior preserves source gates. GET scheduling serializes panel reads and inspection, skips aborted queued reads, recovers after errors and caches no facts or authorization. Commands are never queued or automatically retried; controls wait for pending reads to settle. Every API call retains independent live authorization.

## Executed verification

Artifacts below are under artifacts/governance-v2/.

| Check | Observed result |
| --- | --- |
| Full domain suite | 587 pass, zero failures — P08-F03-domain.log |
| Focused domain | 12 pass, overlapping full suite — P08-F03-focused-optimized.log; valid-format forged source IDs additionally rejected in P08-F03-tamper-final.log |
| Read scheduler | Two controlled transport tests pass: ordering/no-store, failure recovery/no retry, queued abort and POST rejection — P08-F03-read-scheduling-final.log |
| Final live browser | All 12 F01/F02/F03 cases pass in one run, no retries/flakes/skips — P08-F03-browser-complete.json and .log |
| Actual request scheduling | Maximum one browser Twin GET in flight; all recorded responses 200 — P08-F03/browser-read-scheduling.json |
| Actual Metro mobile/browser/API | Four pass, zero failures/flakes/skips — P08-F03-mobile.log and P08-F03-regression-evidence/mobile-workspace/results.json |
| Types | Final contracts/domain/FHIR/web pass — P08-F03-types-complete.log; mobile pass — P08-F03-mobile-types-final.log |
| Lint and optimized build | Full lint and final local optimized build pass — P08-F03-lint-complete.log and P08-F03-build-release-check.log |
| Governance | 16 v2 plus ten local/review tests pass — P08-F03-governance.log and P08-F03-governance-local.log |
| Conformance | Eight regressions pass — P08-F03-conformance.log |
| Existing live-identity worker | 23 new source events consumed; current 191-event timeline has matching source/projection hashes; Twin materialization 18 and conflict review current; seven local requests without clinical resolution; exact materialized source modal and Escape/focus verified — P08-F03-worker-smoke.json and .log |
| Original data | Schema 55 to 56 preserves all original primary keys/values across 37 tables, zero missing/changed originals — P08-F03-preservation.json and .py |
| Prior evidence/configuration | Twelve original shared artifact files restored byte for byte after archiving this run; both generated Next configuration hashes match captured start — P08-F03-evidence-preservation.json and P08-F03-generated-config.json |

Domain oracles use actual synthetic source commands: positive/no-known allergy assessments, differing 250/500 mg drafts, refutation/cancellation, clinical-time ties and unknowns, source correction/rebuild, clock-independent candidates, shared doctor/nurse queue, tenant/role/owner/purpose/session denials, immutable metadata and valid-format forged references, outage, failed request receipt/DDL rollback, real competing SQLite processes, and real 100-request/200-command retention limits. Queue operations leave clinical source versions unchanged.

The browser creates new synthetic source records through real clinical forms, verifies side-by-side source IDs/history links, persists and reloads a request, checks pagination/filtering, Axe and 390-pixel containment. Actual medication cancellation withholds old candidates; rebuild retains the old request as open-source-changed with clinicalResolutionRecorded=false. Existing pre-feature source records are not corrected/deleted. Final desktop/phone captures P08-F03/conflicts-desktop.png and conflicts-phone.png were visually checked.

## Defects found and fixed

The first browser run had 11 passes and one ECONNRESET during a correction POST; persisted version remained 1, confirming that interrupted write did not commit. A subsequent five-case run had three passes and two failures: an initial evidence GET returned 401 while parallel source reads took roughly 3.1/5.4/5.4 seconds, and a direct GET encountered a connection reset. The third panel exposed contention with the unchanged three-second Foundation identity deadline. Browser-local serialized GETs and shared read-busy controls fix the competing-read behavior without relaxing identity checks, caching authorization or replaying writes. Local server HTTP keep-alive is 70 seconds to avoid idle-connection resets during these checks. Final twelve-case regression is entirely clean with unchanged clinical/access assertions and explicit network ordering evidence. Initial logs/JSON and failure traces remain under P08-F03-browser-initial-failures and P08-F03-browser-paged-failures.

Accumulated simulation history also exposed an excessively long initial review panel; filtering and five-candidate pagination fix navigation while retaining every selected source assertion. Initial unbounded screenshots remain in P08-F03-initial-unbounded. A Windows UTF-8 build error was corrected before the verified build; feature source/document encoding checks pass. No source/evidence cleanup deletion or assertion weakening was used.

## Limits and remaining work

[Plan](P08-F03-plan.md), [ADR83](../adr/ADR-0083-source-pinned-conflict-review.md), [architecture/API/operations](P08-F03-architecture-and-operations.md), [risks](P08-F03-risks.md), [scenarios](P08-F03-scenarios.json).

Patterns are bounded review prompts over supplied source identity, not exhaustive clinical validation. Different records can describe different episodes. Current means source/rule match at the last check, not a live-feed guarantee or clinically validated age. Queued requests are local source-verification metadata; qualified handling, reviewer assignment, external delivery, clinical resolution, deployment retention and production capacity require separate decisions. Browser serialization addresses page-local competing reads; it does not certify production multi-user capacity.

P08-F04 max-age/asynchronous refresh and P08-F05 advanced/native UX remain separate. Formal/qualified reviews remain pending and production clinical functionality stays disabled. R4 serialization is unchanged, so no new official FHIR-validator run is claimed; prior Phase 06 evidence is retained and conformance regressions pass. Remote CI has not executed these uncommitted changes. No commit, push, merge, publication, deployment or production activation occurred.
