# P08-F03 architecture and operations

Local synthetic scope. Production clinical functions stay disabled; formal Phase 08 NOT_STARTED. No qualified signoffs are generated.

## Source and rules

Schema 56 adds twin_review_requests and twin_review_commands with immutable triggers. Existing source, evidence and materialized-state tables are retained. Conflict analysis source-review-v1 consumes only current F02 state after live source authorization, availability and byte/hash reproduction. F02 twin-source-v1 state bytes are unchanged. Full source pointers define candidate identity independently of processing time or build ID.

Supported review prompts: effective positive versus no-known allergy assessments; differing same-concept active allergy details; unknown allergy and unconfirmed source verification; differing same-concept medication draft details; literal same-concept condition statuses; equal latest eligible observation times; unknown concept, unsupported status and unknown/future clinical time. Inactive/refuted/entered-in-error allergies do not establish a current positive contradiction. Medication drafts never establish active therapy. Multiple condition records may describe different episodes. No candidate establishes clinical severity, treatment advice, adverse interaction or automated reconciliation.

## API

GET /api/patient-twin/conflicts?patient=... with optional build=... returns status/build/sourceHash/coverage/checkedAt, exact sourced issues and local request metadata. Each supplied build belongs to the current reader and exact organization/facility/patient/treatment/coverage. Stale and not-built responses contain no issues or queue. Corrupt source/state/queue data fails closed. HTTP uses authenticated same-origin no-store source contracts and rejects duplicate/unknown query parameters.

POST /api/patient-twin/conflicts accepts exactly patient, build, issue, commandKey as bounded UTF-8 JSON (2,000 bytes). Current source and candidate membership are rechecked within the write transaction. Immutable requests target clinical-source-verification with fixed open status. They contain source IDs and original build hashes, without copied values or clinical free text. The original build digest and candidate identity are reproduced before queue metadata is served. Idempotent actor/patient keys reject different candidate/coverage contexts. Requests deduplicate by organization/facility/patient/treatment/coverage/candidate across authorized readers who have their own current state. Bounded at 100 requests per source context, 200 receipts per actor/patient; retention never deletes evidence automatically.

## Actual verification path

Open the patient Twin, rebuild the state when required and refresh source review. Each candidate shows its assertions side by side with recorded/clinical timestamps, source version/hash and the actual authorized source-history link. Request source verification records a real durable item in the local shared queue. It does not assign a reviewer, notify an external service, amend a source, complete a qualified review or record a clinical resolution. Source owners use the existing clinical source workflow and history for investigation/correction. After source changes, rebuild and refresh: older requests remain open-source-changed, never automatically resolved.

## Failure and recovery

Offline/context changes clear visible candidates and abort requests. Reconnection requires explicit refresh; writes are not queued/replayed. Cancellation may happen after server commit, so refresh the queue before retrying. Existing idempotency receipts and candidate deduplication retain committed evidence. Source outages cannot become healthy empty results. Failed receipt insertion rolls back the request. Concurrent requests serialize through the existing SQLite transaction. Failed migration56 rolls back and retains schema55/source/state evidence; restore the failed dependency and retry. Operational rollback disables the new UI/route while retaining tables and evidence; disposable fixture rollback is for tests only. Full retention/export/clinical review assignment remains qualified deployment work.

No asynchronous/max-age policy (P08-F04), advanced native Twin UX (P08-F05), production authorization or formal phase acceptance is implied.

Candidate navigation is bounded to five issues per page with a type filter; each selected issue retains all of its source assertions. Live accumulated simulation history exposed an excessively long initial panel, so pagination/filtering are verified in the final browser run. The initial unbounded screenshots and failed encoding-build log are retained separately.

Live regression found that simultaneous F01/F02/F03 reads could exceed the unchanged three-second Foundation session-check deadline under the accumulated source workload. A browser-local GET scheduler now serializes source reads and inspections, skips aborted queued reads, forces no-store, recovers after failure and never retries or queues commands. Shared read-busy state disables source actions until reads settle. Each request still reauthorizes independently; no facts or authorization are cached/shared between patients. Controlled transport tests cover ordering, failure recovery, abort and POST rejection; live regressions verify the actual services. Local HTTP keep-alive is configured at 70 seconds to avoid idle connection resets during these checks; identity deadlines and access controls are unchanged.
