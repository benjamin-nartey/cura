# P05-F03 engineering evidence — 2026-11-03

Status: ENGINEERING_VERIFIED_REVIEW_PENDING; formal acceptance not granted.

## Implemented vertical slice

Schema 46 adds immutable source→target mapping proposals, append-only independent reviews, idempotent command receipts and a derived state view. Pins retain source/target system, code, version and release provenance. Metadata records declared target relationship, mapping version, effective interval, rationale, source reference, proposer, digest and reviewer history. Confidence input is unsupported and rejected.

Every proposal begins pending. An independent permitted user approves/rejects it; approval can be revoked. Review events use expected record version and sequential database constraints. Translation selects only a single effective approved equivalent candidate with no pending competitors; all ambiguous/non-equivalent/pending/unmapped cases return needs-review without a selected target and remain inspectable in the review queue. No clinical source is changed.

Implementation: packages/domain/src/terminology-mappings.ts and terminology-mapping-schema.ts, additive migration in db.ts, terminology.review permission, versioned JSON routes under apps/web/app/api/terminology, mapping-tools.tsx and list/detail pages under /terminology/mappings. The existing mobile registry web handoff reaches the new pages with separate browser authentication. Protected formal records and prior acceptance evidence are unchanged.

## Observed checks

| Check | Observed result | Evidence |
| --- | --- | --- |
| Targeted mapping domain tests | 9 passed, 0 failed | artifacts/governance-v2/P05-F03-targeted.log |
| Full npm test | 420 passed, 0 failed | artifacts/governance-v2/P05-F03-domain.log |
| npm run typecheck | Exit 0 | artifacts/governance-v2/P05-F03-typecheck.log |
| Production build with CURASPHERE_NEXT_DIST=.next-p04f05-build | Exit 0 | artifacts/governance-v2/P05-F03-build.log |
| npm run lint after strict comparison correction | Exit 0 | artifacts/governance-v2/P05-F03-lint-final.log |
| npm run governance:test and governance:v2:test | 10 and 16 passed | artifacts/governance-v2/P05-F03-governance.log |
| Local migration versus consistent schema-45 backup | Schema 46; none of the original 21 patient, 19 release or 9 value-set IDs missing | artifacts/governance-v2/P05-F03-migration-preservation-final.log |
| Complete browser regression and mapping feature suite on schema 46 | 16 passed, 0 failed | artifacts/governance-v2/P05-F03-browser.log and P05-F03-browser.json |

The browser run exercises actual Foundation sessions, local persistence and live API handlers without terminology mocks. It covers administrator UI submission, pending translation, denied self-review, independent clinician review, full reviewer provenance, resolved translation, competing approved targets in the queue, revocation, non-equivalent target withholding, overlapping stale decisions (200/409), foreign-tenant isolation, unsupported confidence and foreign-Origin denial. It also repeats existing P04-F05 clinical/billing, F01/F02 terminology, landing/login, fixed sidebar, responsive tables, account menu and patient portal scenarios.

Automated Axe checks pass on mapping detail; 390px document-overflow verification passes. Desktop and mobile screenshots are stored under artifacts/governance-v2/P05-F03/translation-desktop.png and translation-mobile.png and were visually inspected. No failed browser scenario was skipped or relabeled. Build, type and lint checks pass; a final git diff --check reports no whitespace errors. Generated Next configuration changes were restored; no deliberate existing configuration was discarded.

P05-F03-S01–S09 cover persisted reopen and reviewer provenance; proposal/review idempotency, stale conflict and append-only tables; self-review, wrong role, foreign tenant and suspended account; competing pending/approved targets; non-equivalent/rejected/revoked/unmapped cases; unknown/expired/reference-only/invalid input; forced proposal/review outbox failure; injected migration-46 failure and recovery; dependency/production gates and direct-database transition enforcement. Access-ledger integrity is verified after reviews and denials. Failed reviews retain a denial audit outside their rolled-back transaction.

Commands executed, with logs redirected to the paths above:

```powershell
node --import tsx --import ./packages/domain/test/dev-env.ts --test packages/domain/test/terminology-mappings.test.ts
npm test
npm run typecheck
npm run lint
npm run governance:test
npm run governance:v2:test
$env:CURASPHERE_NEXT_DIST='.next-p04f05-build'
npm run build
$env:CURASPHERE_E2E_BASE_URL='http://127.0.0.1:3000'
npx playwright test tools/e2e/p05-f03.spec.ts tools/e2e/p05-f02.spec.ts tools/e2e/p05-f01.spec.ts tools/e2e/p04-f05.spec.ts tools/e2e/premium-ui.spec.ts tools/e2e/workspace-polish.spec.ts
```

Initial lint identified a loose null comparison. It was replaced with explicit null/undefined checks; final lint passes. No test assertion was weakened. Historical rollback scenarios retain original target-version assertions after newest fixture extensions are removed; only current schema-head expectations advance to 46. Legacy “phase PASS” output is software behavior evidence, not formal phase acceptance.

## Restrictions and remaining work

Local synthetic engineering only. Review actions exercised by fictional test identities verify workflow behavior; they do not supply a real qualified clinical signoff. No licensed terminology content, confidence use, real PHI, external healthcare integration, clinical mutation, production activation, push, merge, publication or deployment is enabled. Formal Phase 02 reviews remain pending; formal Phase 04 remains NOT_STARTED. P05-F04/F05 are not implemented by this feature.

See P05-F03-plan.md and P05-F03-architecture-and-operations.md for ADR, API/event contract, permission/tenant rules, user guidance, risks, monitoring, dependency behavior and rollback. The local snapshot location is recorded in artifacts/governance-v2/P05-F03-backup.log. Operational rollback retains immutable records; fixture-only teardown is not a live downgrade.
