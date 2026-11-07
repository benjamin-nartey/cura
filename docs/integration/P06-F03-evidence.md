# P06-F03 — completed local engineering evidence

Status: ENGINEERING_VERIFIED_REVIEW_PENDING. Formal Phase 06 remains NOT_STARTED. Production clinical functions remain disabled. Verification is automated engineering evidence, not qualified clinical, privacy, architecture or licensing approval. See [plan](P06-F03-plan.md), [architecture/runbook](P06-F03-architecture-and-operations.md), [risks](P06-F03-risks.md) and [ADR-0073](../adr/ADR-0073-signed-local-partner-exchange.md).

## Implemented behavior

Schema 49 → 50 adds durable partner connections, immutable identity links, inbox/duplicate-message aliases, applied source heads, patient subscriptions, immutable source outbox and dependency controls. All original rows and full values were preserved across 15 clinical/provenance/SMART tables. Source recording/correction and outbox snapshots share one transaction; nested clinical commands use savepoints with a Node-version-compatible depth fallback.

Signed inbound messages persist before review. Exact bytes, connection/message identity and bounded timestamp are authenticated. Malformed, unknown/duplicate-field, unsupported-code/unit, unmapped-identity and out-of-order payloads are quarantined. Alternate message IDs for the same resource/version resolve to the same durable receipt; their byte identity remains protected on future retries. Existing clinical services perform explicit clinician-approved recording/correction. No patient is guessed or automatically created. A partner patient cannot be retargeted through another encounter; two distinct partner namespaces can legitimately reuse the same identifier for two different local patients.

Active subscriptions capture source Observation snapshots automatically. Explicit exports target only the selected subscription. Actual loopback HTTP delivery uses stable IDs, signed bodies, live original session/patient gates, durable leases, bounded retries and terminal quarantine. No cookie is forwarded. The UI provides configuration, identity linking, mapped-patient import inspection, review/rejection, subscription lifecycle, export, delivery diagnostics and retry times. Forms and tables use the workspace typography/controls and fit 390-pixel screens. Native/mobile partner administration is N/A for this workforce web feature; existing mobile API/browser behavior was regressed.

The shipped receiver, sender and bounded worker are executable local processes. The receiver preserves deduplication across actual restart. The browser suite executes the sender against the running signed endpoint and the worker against an actual Foundation session and durable outbox. The worker records actual transport failure; it does not synthesize acknowledgement.

## Actual verification

All artifact paths below are relative to `artifacts/governance-v2/`. Earlier failed runs remain retained and were not counted as passing.

| Executed command / check | Observed outcome and evidence |
|---|---|
| `npm test` | 475 pass, zero failures — `P06-F03-domain-verified.log` (459 prior + 16 new integration scenarios) |
| `npm run integrations:test` | 20 pass — 16 domain + 3 HTTP/security + 1 actual receiver process-restart test — `P06-F03-integrations-complete.log` |
| Receiver after its explicit ESM package boundary | One actual process-restart scenario passes again — `P06-F03-partner-receiver-esm.log` |
| `npx playwright test tools/e2e/p06-f03.spec.ts` against port 3000 | All three pass on the responsive final build — `P06-F03-browser-accepted-local.log/json` |
| Existing source/SMART/landing/login/workspace browser regressions | All 11 existing scenarios pass in `P06-F03-browser-complete.log/json`. That combined run retained two then-failing new F03 scenarios; the subsequent three-scenario F03 run verifies their corrections. Total unique verified web scenarios: 14 |
| `npx playwright test --config playwright.mobile.config.ts --reporter=list` | All four mobile browser/API scenarios pass — `P06-F03-mobile.log`; screenshots archived in `P06-F03-mobile/` |
| `npm run governance:v2:test` and `npm run governance:test` | 16 + 10 pass — `P06-F03-governance.log`, `P06-F03-governance-local.log` |
| `npm run typecheck` | Contracts/domain/FHIR/web pass — `P06-F03-typecheck-complete.log` |
| `npm run typecheck --prefix apps/mobile` | Pass — `P06-F03-mobile-types.log` |
| `npm run lint` | Pass — `P06-F03-lint-final.log` |
| Local optimized `npm run build` | Pass, final responsive build — `P06-F03-build-responsive.log` |
| `node --import tsx tools/fhir/generate-fixtures.ts`; `node tools/fhir/validate.mjs` | All seven official HL7 expected outcomes pass — `P06-F03-validator-final-run.log`, `P06-F03-validator/summary.json` and raw reports |
| Preservation comparison against consistent pre-upgrade backup | Every original primary/compound key and complete original row value retained in all 15 tables — `P06-F03-preservation.json` |
| Actual scoped cleanup through the running API | Seven test subscriptions ended; eleven temporary test connections disabled after partner processes stopped; no clinical rows deleted — `P06-F03-operational-cleanup.json` |

Official validator: integrity-checked HL7 CLI 7.0.4, R4 4.0.1, Java 21.0.12.1, terminology service disabled with `-tx n/a`; SHA-256 `43e29fa8822d670740a909c395ca5b70a3d07fbaa8936f8dedc6a98b007f555b`. Patient: 0 errors/1 warning; source bundle: 0/18; lifecycle: 0/20; SMART delegated: 0/18; new two-Observation partner export: 0/8. Deliberate missing-birth-date and executable-ServiceRequest fixtures each have the expected one error. Missing full narratives and unknown synthetic code-system warnings remain visible. Licensed terminology validation, US Core and full SMART certification are not claimed.

The runner's legacy default directory was archived to the feature-specific folder; its initial failing export is retained in `P06-F03-validator-initial/`. Previous-phase six-case reports were retained in `P06-F02-validator/` and restored to the legacy default after the new seven-case results were archived. Earlier browser/mobile evidence was retained; no local database or signing root was staged for source control. CI includes the new domain/HTTP/receiver cases and generated partner fixture, but no unexecuted remote CI success is claimed.

## Scenario oracles and defects corrected

1. Signed receipt alone creates no Observation. One approved receipt creates one real source record/history; duplicate and alternate-ID retries return that record. Two separate SQLite processes reviewing concurrently commit one source record total.
2. North and South partner fixtures both use MRN-100/VISIT-100 and map to different persisted local patients. Retargeting one partner's patient identifier through a new encounter is denied.
3. Malformed JSON, duplicate JSON properties, unsupported fields/codes/units, conflicting source versions, unknown identities and out-of-order updates do not write clinical events. Wrong signature, stale timestamp, missing signing root and production/real-PHI flags fail closed.
4. Foreign tenant/facility, unsupported purpose, nurse write attempts, admin clinical attempts, revoked sessions and non-admin secret disclosure are denied. The browser API separately denies cookies/Origins on partner transport, foreign Origins on management and anonymous management.
5. Contiguous approved corrections preserve source history. An intervening local correction prevents partner overwrite. Forced head/outbox insertion failures roll back the entire clinical command, coding/history and review; retry after dependency repair succeeds.
6. Source creation/correction queues immutable version snapshots. Duplicate explicit export returns the same job and does not queue other subscribers. Pause/resume/end are version-checked; terminal end/disable and revoked original authority prevent future delivery. Expired leases recover, retries back off and five failed attempts quarantine.
7. A real HTTP receiver verifies signatures and records one event across a lost acknowledgement and retry. Concurrent delivery attempts claim one lease/send once. A separately spawned shipped receiver preserves its SQLite receipt after process restart.
8. Browser workflow actually registers/reveals a key, links the local encounter, subscribes, receives a signed message, inspects the mapped patient/values, approves, reads the resulting source through its protected preview, observes a failed acknowledgement/retry, verifies successful deduplicated delivery and pauses/resumes. Axe checks pass; 390-pixel page width equals scroll width. Screenshots: `P06-F03/partners-desktop.png`, `partners-mobile.png`, `partner-form-mobile.png`.
9. The shipped signed sender produces an actual quarantined unmapped-identity receipt against the running app. The shipped worker reloads a real Foundation session and persists a real failed network attempt. Aggregate output contains no signing key or clinical body.

Testing corrected a Foundation-session compatibility check, exact public-Origin handling/referrer policy, relative synthetic quantity-system URIs, durable alternate-message ID binding, and accidental transport/session metadata exposure in browser DTOs. Visual inspection corrected text encoding and applied the existing workspace field/button styles. A long subscription ID exposed grid min-content overflow; constrained tracks/controls fix it without hiding table overflow.

The initial browser malformed-message test client JSON-quoted invalid text; it now sends the exact signed bytes as a Buffer. An API keepalive reset on an idempotent replay is retried once using Playwright's documented ECONNRESET-only request retry, without retrying failed HTTP assertions. Direct execution found that the tool directory required an explicit ESM boundary for its top-level-await worker/sender; real child-process tests now exercise both. Receiver startup allowance was increased for the memory-constrained host; failed diagnostics remain retained.

## Remaining scope and status

Inbound import is a documented bounded quantity-Observation contract; unsupported FHIR content is retained in quarantine, not claimed as imported. Outbound additionally supports component Observations. Network delivery is at least once and requires receiver deduplication; already in-flight requests cannot be recalled. Key distribution/retention is an explicit local operator responsibility. Bulk/resumable movement, quarantine reconciliation/replay and published conformance/R5 work remain F04/F05 and are NOT_STARTED.

Formal/qualified reviews remain pending. This completes local engineering of F03; it does not enable production clinical functions. No commit, push, merge, publication or deployment was performed during this feature. Stop before P06-F04.
