# P05-F05 engineering evidence — 2026-11-03

Status: ENGINEERING_VERIFIED_REVIEW_PENDING. Formal acceptance not granted.

## Implemented scope

Shared version-aware pickers now cover source condition, allergy, vital observation/components, non-executable medication draft and internal department-request forms. They display exact code/system/version, description, units, binding revision and definition/mapping provenance. Web writes require the rendered selection metadata and command key; existing trusted domain callers remain compatible and are still server-validated and pinned. Unknown/forged/stale selections cannot create source facts. Existing clinical rules, scope/consent/encounter checks, medication non-executability and no-transmission gates remain.

Schema 48 adds immutable tenant-scoped coding definitions and source pins, exact source-tuple matching guards and pinned-source coded-identity freeze triggers. Pins are written atomically with source data, audit/history, command receipt and metadata-only outbox event. Corrections retain the original definition. Suspended accounts cannot replay source mutation receipts; in-transaction command rechecks protect simultaneous submissions. Older records are not backfilled or silently relabeled. Patient-authorized provenance and administrator-only conformance views show the actual scope/limitations.

Implementation: packages/domain/src/clinical-coding.ts, clinical-coding-schema.ts, clinical-code-pickers.ts, existing clinical-source.ts/work.ts services, additive db.ts migration; shared clinical-code-picker.tsx, clinical recording form routes, source/new/detail pages, coding provenance/definition/conformance views and metadata endpoints under /api/terminology. Mobile remains read-only with separately authenticated web handoffs. No new clinical code admission, licensed-standard content, clinical rule values or production activation.

## Observed checks

| Check | Observed result | Evidence |
| --- | --- | --- |
| Initial targeted coding scenarios | 9 passed | artifacts/governance-v2/P05-F05-targeted.log |
| Final full domain suite including database/account/replay guards | 440 passed, 0 failed | artifacts/governance-v2/P05-F05-domain-verified.log |
| Workspace type check | Exit 0 before final receipt annotation repair; final build also checks final source | artifacts/governance-v2/P05-F05-typecheck-final.log |
| Final production build / TypeScript after receipt type repair | Exit 0 | artifacts/governance-v2/P05-F05-build-final-verified.log |
| Lint | Exit 0 | artifacts/governance-v2/P05-F05-lint-verified.log |
| Governance suites | 10 and 16 passed | artifacts/governance-v2/P05-F05-governance.log |
| Mobile TypeScript | Exit 0 | artifacts/governance-v2/P05-F05-mobile-typecheck.log |
| Mobile restricted-origin unit test | 1 passed | artifacts/governance-v2/P05-F05-mobile-origin.log |
| Mobile browser/API regression suite | 4 passed, 0 failed | artifacts/governance-v2/P05-F05-mobile-browser.log and P05-F05-mobile-browser.json |
| Standalone final workspace TypeScript check | Exit 0 | artifacts/governance-v2/P05-F05-typecheck-verified.log |
| Final UI repair production build / TypeScript | Exit 0 | artifacts/governance-v2/P05-F05-build-ui-final.log |
| Final lint including availability-aware booking helper | Exit 0 | artifacts/governance-v2/P05-F05-lint-ui-final.log |
| Schema 48 preservation versus schema-47 consistent snapshot | No original patient/source/catalog/terminology/order IDs missing | artifacts/governance-v2/P05-F05-migration-preservation.log |
| Final complete web suite on the repaired build | 22 passed, 0 failed | artifacts/governance-v2/P05-F05-browser-final.log and P05-F05-browser-final.json |
| Authenticated administrator conformance API snapshot | 35 scoped source records, 0 missing code/system/version fields, 14 new pins, 21 historical unpinned | artifacts/governance-v2/P05-F05-conformance-snapshot.json |

P05-F05-S01–S10 cover all five representative writes and metadata pins; forged system/version, stale revision and unknown codes; implicit legacy calls and identical replay; correction/closure/reopen preservation; tenant/role boundaries and conformance counts; atomic source/definition/pin/outbox rollback; wrong units/components/closed encounter; failed migration 48 repair without invented history; current dependency/production failure with retained historical receipt; direct-database tuple/code-drift rejection and suspended writer/replay denial. Access-ledger integrity remains verifiable.

Initial full regression: 394/439 passed, 45 failed because older clinical/source work fixtures configured only the local directory flag. New coding writes correctly required all four isolated-sandbox flags. Those two fixture files now explicitly default their test environment to local/synthetic/override mode; runtime guards and all historical assertions remain intact. The first corrected run passed 440/440 after adding the database/account scenario. The final verified 440-test run includes active-account and transaction-recheck changes.

The build then caught a TypeScript narrowing problem: using typeof a prior receipt after its truthy branch had returned narrowed the type to undefined. The transaction rechecks now use the same explicit receipt types as their original reads. This is an annotation repair; the final production build passes. Failed build/test logs remain preserved rather than counted as passing.

The first web browser run found an exhausted fixed Tuesday after many retained simulations. tools/e2e/booking.ts now finds a real available Tuesday within a bounded twelve-week window using the actual booking UI. Existing bookings are never deleted, capacity is not bypassed, and assertions remain unchanged. Updated P04/F04/F05 browser fixtures use the helper. The final full browser run passed all 22 scenarios.

The same initial web run exposed a real medication-detail UI defect: the new provenance link was present in the unavailable-record branch instead of the authorized detail branch. The draft and immutable receipt persisted correctly. The link was moved into the authorized view, and observation provenance links are shown only for available records. The first full browser report retains its 20 passes and 2 failures (booking fixture plus link defect); final verification uses a new complete run, without skipping assertions.

Final browser evidence uses actual sessions/APIs/SQLite, covering all five representative writes, visible description/unit/version/revision feedback, recorded provenance after closure, actual foreign-tenant record denial, forged/stale/free-text selections, simultaneous identical observation POSTs returning the same source ID, administrator-only metadata coverage and foreign-Origin denial. Existing clinical/billing, F01–F04, premium UI, fixed sidebar/menu/table and portal checks pass. Automated Axe and 390px document-overflow checks pass. Desktop/mobile provenance screenshots in artifacts/governance-v2/P05-F05/coding-desktop.png and coding-mobile.png were visually inspected. The mobile suite additionally covers financial isolation, actual chart reading, outage view clearing and sign-out without persisted tokens. Real-device clinical validation is not claimed.

Generated Next type/config changes were restored after verification; no deliberate existing configuration was overwritten. Final git diff --check is clean. The original formal governance files/registers remain unchanged. The phase exit report is PHASE_05_LOCAL_ENGINEERING_EXIT.md; stop before Phase 06.

Executed commands (logs redirected to the artifact paths above):

```powershell
node --import tsx --import ./packages/domain/test/dev-env.ts --test packages/domain/test/clinical-coding.test.ts
npm test
npm run typecheck
npm run lint
npm run governance:test
npm run governance:v2:test
npm run typecheck --prefix apps/mobile
node --import tsx --test tools/platform/mobile-origin.test.ts
$env:CURASPHERE_NEXT_DIST='.next-p04f05-build'
npm run build
$env:CURASPHERE_E2E_BASE_URL='http://127.0.0.1:3000'
npx playwright test tools/e2e/p05-f05.spec.ts tools/e2e/p05-f04.spec.ts tools/e2e/p05-f03.spec.ts tools/e2e/p05-f02.spec.ts tools/e2e/p05-f01.spec.ts tools/e2e/p04-f05.spec.ts tools/e2e/premium-ui.spec.ts tools/e2e/workspace-polish.spec.ts
npx playwright test tools/e2e/mobile-workspace.spec.ts --output artifacts/governance-v2/P05-F05-mobile
```

## Review and phase boundary

Qualified clinical/regulatory/licensing/jurisdiction reviews remain ungranted. All simulated actors and rule packs are fictional test behavior, not signoff. Formal Phase 02 reviews remain pending and formal Phase 04 remains NOT_STARTED. Licensed terminology interoperability and production validation are not established by metadata coverage. Protected formal registers and original acceptance hashes remain unchanged. No real PHI, prescribing/dispensing, external healthcare delivery, push, merge, publication or deployment was performed. Stop at Phase 05; Phase 06 is not authorized by this continuation.

See P05-F05-plan.md and P05-F05-architecture-and-operations.md for intended use, ADR, API/events, UI states, risks, monitoring, failure recovery and rollback. The consistent pre-rollout database snapshot path is in artifacts/governance-v2/P05-F05-backup.log. Fixture teardown is disposable only; operational rollback retains immutable records.
