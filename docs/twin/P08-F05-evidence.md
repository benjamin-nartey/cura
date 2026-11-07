# P08-F05 clinician inspection evidence

Date: 2026-11-06. Local synthetic engineering verified. Formal Phase 08 remains NOT_STARTED. Qualified prerequisite, clinical, privacy, architecture and licensing reviews remain pending; production clinical functions remain disabled.

## Delivered

Read-only source-reproduced inspection over schema 57, without migration or source edits. The domain read adapter provides literal overview counts, bounded searchable/category-filtered signed pages, pending work, retained snapshot/last-visit comparison and exact current/historical ledger evidence. Current authorization and full clinical/work source hash bind actor/session/organization/facility/patient/purpose/coverage/build and every page. A work-only source change invalidates comparison pages. No diagnostic, therapy, risk or clinical-resolution inference is added.

The default Patient Twin page has responsive overview cards, source assertions, pending source links, before/after comparison and exact-evidence dialog with title focus, Tab containment, Escape and trigger restoration. Existing F01-F04 controls remain under Source tools, with all prior functional/security assertions retained. Server pages check source access before patient-specific links or controls; authorized corrupt-cache repair remains available independently of the cache. Source-gated identity is delivered only with the client read model. Native care-team Workspace opens the same contract through its strict bearer-only adapter, with actual filtering/evidence/comparison and explicit safe refresh. Offline/context/failure/cancelled or late reads clear cached identity and values. No offline clinical store or bearer token link is introduced.

Implementation: packages/domain/src/twin-inspection.ts and root exports; domain test/twin-inspection.test.ts; web lib/twin-inspection-query.ts and components/twin-inspection.tsx/.module.css; web GET /api/patient-twin/inspection; native GET /api/mobile-workspace/twin; patient /twin and /twin/sources routes; apps/mobile/src/TwinInspection.tsx and Workspace.tsx integration; tools/e2e/p08-f05.spec.ts and retained F01-F04 navigation fixtures. Package test/lint coverage includes these files.

## Executed verification

| Check | Actual observed result |
| --- | --- |
| Full domain | 616 pass, 0 fail/skip; P08-F05-domain.log |
| Focused F05 domain | 12 pass; P08-F05-focused-complete.log |
| Initial corrected live F05 suite | 5 pass, no retries; P08-F05-browser-verified.json/.log |
| Final combined F01-F05 browser suite | 21 pass, zero retries/flakes/skips; P08-F05-browser-complete.json/.log |
| Final strengthened native case | One overlapping pass including held late authentication failure after cancellation/navigation; P08-F05-native-final.json/.log |
| Existing actual mobile/browser/API regressions | Four pass; P08-F05-mobile.log and P08-F05-regression-evidence/mobile-workspace/results.json |
| Live end-state workers | 17 newly processed events; current 223-event canonical/materialized timeline with matching hashes; Twin materialization 41, current conflicts/background verification and exact clinician evidence; P08-F05-worker-smoke.json/.log |
| Restored local bounded watcher | Authenticated API-enqueued job consumed/completed; P08-F05-watch-proof.json, P08-F05-watch.log and P08-F05-watch-process.json |
| Preservation | Schema 57 unchanged; all original keys/values across 43 tables retained; 19 original evidence files and both generated config hashes restored; P08-F05-preservation.json, P08-F05-evidence-preservation.json, P08-F05-verification-summary.json |
| Governance | 16 v2 plus 10 local/review checks pass; P08-F05-governance.log and P08-F05-governance-local.log |
| Conformance | 8 pass; P08-F05-conformance.log |
| GET scheduling | 2 pass; P08-F05-read-scheduling.log |
| Types | contracts/domain/FHIR/web pass in P08-F05-types-final.log; mobile in P08-F05-mobile-types-final-verified.log; final web build validates generated route types |
| Lint/build | P08-F05-lint-final-verified.log and final optimized P08-F05-build-verified.log pass |

Artifact paths above are under artifacts/governance-v2/. Focused cases overlap full-domain counts; do not add them as distinct tests. The new live suite uses real synthetic clinical creation/correction and immutable snapshots, actual local Foundation identity and actual Expo code, with isolated transport-failure injection for deterministic UI failure oracles. No real PHI or clinical delivery is involved.

## Defects found and fixed

The first five-case run passed the API isolation case and found select labels including option text, an ambiguous test locator matching the Next route announcer, and a native comparison read reaching the existing 12-second transport cutoff. Explicit select labels fix the accessibility issue; the error assertion now targets the inspection section while preserving the required visible error. Native Twin reads have a bounded 30-second limit with visible cancellation and late-response rejection; other native endpoints retain 12 seconds. A direct authenticated baseline read returned 200 in 2107 ms. The corrected five-case run passes. Original failed-run JSON/log are retained; they are not presented as passes.

Visual/navigation review then found that returning from comparison could show all assertions under a previously selected category. Web/native source-assertion navigation now applies the displayed category/query; final tests pass that round trip. Native timestamps explicitly show UTC and processing time. Code review also identified a delayed mobile failure that could affect a newer directory context; the parent handler now checks its originating token/navigation generation, with a passing dedicated held-response regression. Web changes are included in the final optimized build. Native changes were exercised through actual Metro code in the passing combined and strengthened native runs. Desktop, comparison and native phone captures were visually inspected; Axe and phone-width assertions run in the actual live tests.

## Documentation and remaining boundaries

[Plan](P08-F05-plan.md), [ADR85](../adr/ADR-0085-source-gated-clinician-twin-inspection.md), [architecture/API/runbook/rollback](P08-F05-architecture-and-operations.md), [intended use](P08-F05-intended-use.md), [risks](P08-F05-risks.md), [scenarios](P08-F05-scenarios.json), [Phase 08 exit report](phase-08-engineering-exit-report.md).

Local synthetic verification does not certify clinical validity, production multi-user/mixed-view capacity, external feed completeness or native hardware behavior. Counts remain source assertions; drafts are not active therapy, unknowns are not normality, care gaps/risk remain unassessed and source-verification requests are not clinical resolution. Remote CI has not executed these uncommitted changes. No commit, push, merge, publish, deploy or production activation occurred. Stop before Phase 09.

## Exact executed commands

Commands run from the repository root; browser commands set CURASPHERE_E2E_BASE_URL=http://127.0.0.1:3000 and a feature-specific CURASPHERE_E2E_REPORT path. Build commands selected the inactive local dist directory through CURASPHERE_NEXT_DIST and retained local/synthetic/override flags. Private keys/session tokens were supplied in process environment, not printed or committed.

- npm test
- npm run twin:inspection:test
- npm run typecheck; npm run typecheck --prefix apps/mobile
- npm run lint; npx eslint packages/domain/test/twin-inspection.test.ts
- npm run build
- npm run governance:v2:test; npm run governance:test; npm run conformance:test
- node --import tsx --test tools/platform/twin-reads.test.ts
- npx playwright test tools/e2e/p08-f01.spec.ts tools/e2e/p08-f02.spec.ts tools/e2e/p08-f03.spec.ts tools/e2e/p08-f04.spec.ts tools/e2e/p08-f05.spec.ts
- npx playwright test tools/e2e/p08-f05.spec.ts --grep "actual Expo Twin"
- npm run test:e2e:mobile
- node artifacts/governance-v2/P08-F05-worker-smoke.cjs
- node artifacts/governance-v2/P08-F05-watch-proof.cjs
- python artifacts/governance-v2/P08-F05-preservation.py
- python artifacts/governance-v2/P08-F05-restore-evidence.py
- python artifacts/governance-v2/P08-F05-verification-summary.py

The task-owned watcher is fixed to the live doctor/Kofi context, 120 sequential passes at 30-second intervals, explicitly queued work only. Verify its exact bootstrap command line against P08-F05-watch-process.json before stopping it. Each child reauthorizes source access; no general service identity or production scheduler is claimed. New regression evidence is archived separately and original evidence bytes are restored. Safe rollback retains all source, snapshot, derived build, job and audit history; the tested Source tools route remains available without a schema downgrade.
