# P08-F04 — Staleness and rebuild operations evidence

Local synthetic engineering verified 2026-11-05. Formal Phase 08 remains NOT_STARTED. Qualified prerequisite, clinical, privacy, architecture and licensing reviews remain pending; production clinical functions remain disabled. P08-F05 is unstarted.

## Delivered

Schema 57 adds owner/organization/facility/patient/treatment/source-coverage-bound durable refresh jobs, idempotent command receipts, immutable transition events and immutable verification checkpoints. Clinical source rows and F01/F02/F03 contracts are preserved. source-check-v1 declares per-type background verification budgets: condition/allergy 60 minutes, medication drafts/care plans 15 minutes, observations/orders/referrals 5 minutes. These are local operational budgets, not clinical expiry or validated medical recency. Source-recorded and supplied observation clinical timestamps remain independent of processedAt, checkedAt and background verifiedAt.

GET /api/patient-twin/operations exposes metadata, per-type budgets/ages/status and job progress; POST enqueues refresh/repair or explicitly retries/cancels. Reads and actions reauthorize live source access. Wrong context/owner/role, revoked authority, malformed or overlarge JSON, unknown keys/actions and foreign origin fail closed. No cached clinical facts or worker token is returned. One active job per exact context, three attempts, 60-second fenced leases and 100-job/200-command retention bounds preserve evidence rather than deleting it.

Actual separate workers claim, prepare from source and complete verification. Existing F02 append repair is reused. Same-source refresh records a new checkpoint without changing F02 state bytes, version or processedAt. Prepared result and successful checkpoint are distinct commits: failure can leave a valid new derived build, but never falsely records successful background verification. A correction between preparation/completion invalidates certification; retry incorporates current source. Cancelled/expired/replaced workers cannot complete. No source clinical writes or reconciliation are performed.

The responsive operations panel shows required/overdue/unverified/corrupt/clock states, source timestamps and durable queued/running/failed/succeeded/cancelled jobs with phase, attempts, result pointer and explicit actions. Source/history links remain usable during running jobs. Bounded opt-in status observation reads persistence rather than inventing timer success. Shared serialized GETs preserve fresh independent authorization. Observed changed source pointers or unavailable source authority clear cached Twin views; reconnection never replays a command. Mobile table supports keyboard/horizontal scrolling. A bounded local watcher consumes explicitly queued work for the supplied live owner/patient; optional due scheduling is separately gated and tested.

## Executed verification

Artifacts below are under artifacts/governance-v2/.

| Check | Observed result |
| --- | --- |
| Full domain suite | 604 pass, zero failures/skips — P08-F04-domain.log; includes 17 new F04 cases |
| Focused iterations | First 14 and then 15 focused cases passed — P08-F04-focused.log, P08-F04-focused-final.log; two later scheduling cases are included in the final 604-case run |
| Browser GET scheduling | Two controlled transport regressions pass — P08-F04-read-scheduling.log |
| Final live Twin browser suite | All 16 F01/F02/F03/F04 cases pass in one run, zero retries/flakes/skips — P08-F04-browser-complete.json and .log |
| Actual Metro mobile/browser/API | Four pass, zero failures/flakes/skips — P08-F04-mobile.log and P08-F04-regression-evidence/mobile-workspace/results.json |
| Types | Final contracts/domain/FHIR/web checks pass — P08-F04-types-final.log; mobile pass — P08-F04-mobile-types.log |
| Lint/build | Full lint and final optimized local build pass — P08-F04-lint-complete.log, P08-F04-build-final.log |
| Governance/conformance | 16 v2 plus ten local/review tests and eight conformance regressions pass — P08-F04-governance.log, P08-F04-governance-local.log, P08-F04-conformance.log |
| Live end-state workers | Current 206-event canonical/materialized timeline with matching hashes; Twin materialization 30 and conflict model current; background refresh succeeded; due empty-source scheduling executed and completed; no clinical resolution recorded — P08-F04-worker-smoke.json and P08-F04-worker-smoke-final.log |
| Actual bounded watch | An API-enqueued job was consumed/completed by the running local watcher; current source metadata verified without manual worker execution — P08-F04-watch-proof.json, .log and P08-F04-watch.log |
| Original data | Schema 56 to 57 preserves original keys/values across 39 distinct clinical/provenance/integration/state/review tables, zero missing/changed originals — P08-F04-preservation.json and .py |
| Prior evidence/configuration | 15 shared artifact files restored byte for byte after archiving this run; both generated Next configuration hashes match captured start — P08-F04-evidence-preservation.json and P08-F04-generated-config.json |

Domain oracles cover actual source corrections/history, exact deadline equality and different per-type budgets, same-source stable F02 bytes, no source mutation, real queued execution, checkpoint failure after committed derived progress, explicit retry, outage/recovery, lease expiry and cancellation fences, owner/tenant/purpose/session/coverage isolation, scoped replay, atomic receipt/DDL rollback, corrupt cache/checkpoint append repair, exhausted attempts, actual competing SQLite worker processes, real 100-job/200-command limits, correction between prepare/completion, due scheduling and same empty-source hash under changed permission coverage. Clock uncertainty never counts as within-budget verification.

The browser holds a real separately launched worker after its durable claim, opens actual authoritative source history while its job is running, then permits real completion. A newly recorded synthetic observation is corrected through the real clinical endpoint; operations checking clears cached views, the actual CLI repairs the requested job, and exact source inspection returns version 2/value 37.9 with matching SHA. No pre-feature source record is corrected or erased. Queued cancellation, HTTP isolation, source/authority outage redaction and offline no-replay behavior are verified. Axe runs at desktop and 390-pixel widths; keyboard scrolling and document-width containment pass. Final job-running, source-stale, desktop and phone captures under P08-F04/ were visually checked.

## Defects found and recovery evidence

The first four-case browser run had two passes and two worker-launch failures: the new worker directory lacked an explicit ES-module boundary, so top-level await failed before a claim. The tools package now declares module type and the live worker fixture uses that same boundary. The failed job/source records were retained; the strengthened fixture verifies the exact requested repair job and establishes its baseline through the actual F02 service. The corrected focused run passed all four cases; the final 16-case run is clean. Launch-failure logs/JSON and traces remain under P08-F04-worker-launch-failures.

Visual review found an obsolete queued-command message after successful completion and a clipped phone table caption. Successful metadata reads now clear the old command message, the caption is aligned visibly, and the scroll region is labelled/focusable with an actual keyboard/Axe phone test.

The first supplementary combined Timeline/worker check completed source work but did not verify its final Twin read. P08-F04-worker-smoke.log retains that failure. The final check unmounts unrelated Timeline background observations before the longer worker/end-state sequence; all exact final assertions then pass. This is a bounded local end-state check, not a claim of production mixed-view stress capacity. No identity deadline, permission, source gate or clinical assertion was relaxed to make tests pass.

## Operations, limits and remaining work

[Plan](P08-F04-plan.md), [ADR84](../adr/ADR-0084-leased-source-verified-twin-refresh.md), [architecture/API/state diagrams/runbook](P08-F04-architecture-and-operations.md), [intended use](P08-F04-intended-use.md), [risks](P08-F04-risks.md), [scenarios](P08-F04-scenarios.json).

The task-owned local watcher is bounded to 120 sequential passes at 30-second intervals, uses a fixed live doctor/Kofi source context, processes explicit queued requests by default and stops on repeated invocation failure. It is not a production scheduler or general service-account grant. Its process record is P08-F04-watch-process.json. Verify that exact command line before stopping it; pause this task-owned watcher before controlled-claim E2E fixtures, then restart explicitly with renewed authority. Do not stop unrelated services. Due scheduling can be opted into separately through the documented environment flag.

Current means source reproduction at the recorded check; within-budget describes background verification age, not clinical validity. Checkpoints do not refresh supplied physiologic times, establish active medication therapy, resolve clinical disagreements, complete qualified reviews or certify external feed completeness. Source/build and job quotas remain bounded; retention, clinical thresholds, multi-user/mixed-view load, service identity and production scheduling require qualified decisions. The initial supplementary read failure is retained as a capacity/availability qualification limit rather than hidden.

F05 advanced/native inspection remains separate. Formal/qualified acceptance is pending and production clinical functionality remains disabled. R4 serialization is unchanged; no new official FHIR-validator result is claimed, and existing Phase 06 validation evidence is retained. Remote CI has not executed these uncommitted changes. No commit, push, merge, publication or deployment occurred.
