# P05-F04 engineering evidence — 2026-11-03

Status: ENGINEERING_VERIFIED_REVIEW_PENDING. Formal acceptance not granted.

## Implemented scope

Schema 47 adds immutable catalog/formulary versions, explicit current heads, actor/payload-bound command receipts and immutable pins on the existing work_orders workflow. Tenant-wide organization defaults and active-facility overrides retain exact controlled concept/unit/provenance metadata. Unknown, inactive, retired, expired, future or stale override selection fails closed. A facility override cannot bypass an unavailable default; another facility never receives that override.

Existing department requests optionally select a versioned test/procedure. Code, description and category are derived by the server and eligibility is rechecked inside the order transaction. The request snapshot retains its original catalog revision, terminology version, unit pack and digest after catalog change, encounter closure, cancellation and database reopen. New catalog-order retry hashes bind actor/facility/selection. Existing clinical/consent/encounter permissions and no-transmission restrictions remain. Drug entries are administrative metadata and cannot create department requests or prescriptions.

Implementation: packages/domain/src/facility-catalogs.ts, facility-catalog-schema.ts, additive db.ts migration, catalog manage permission, work.ts integration, JSON routes under apps/web/app/api/terminology/catalogs, catalog-form.tsx and list/detail screens, and the existing work/orders new/detail/API routes. Mobile uses the existing separately authenticated registry web handoff; a native clinical editor is N/A. Prior pricing, formulary facts, clinical records and protected governance evidence remain intact.

## Observed verification

| Check | Observed result | Evidence |
| --- | --- | --- |
| Targeted catalog scenarios | 10 passed | artifacts/governance-v2/P05-F04-targeted-final.log |
| Final full npm test including newer-terminology archived-order preservation | 430 passed, 0 failed | artifacts/governance-v2/P05-F04-domain-final.log |
| npm run typecheck | Exit 0 | artifacts/governance-v2/P05-F04-typecheck.log |
| Final production build with CURASPHERE_NEXT_DIST=.next-p04f05, including TypeScript | Exit 0 | artifacts/governance-v2/P05-F04-build-final.log |
| Final npm run lint | Exit 0 | artifacts/governance-v2/P05-F04-lint-final.log |
| npm run governance:test and governance:v2:test | 10 and 16 passed | artifacts/governance-v2/P05-F04-governance.log |
| Migration preservation versus consistent schema-46 backup | Schema 47; none of 21 patient, 29 release, 11 value-set, 5 mapping or 2 original order IDs missing | artifacts/governance-v2/P05-F04-migration-preservation.log |
| Full browser run before fixture correction | 18 passed, 1 fixture failure | artifacts/governance-v2/P05-F04-browser.log and P05-F04-browser.json |
| Corrected final catalog browser suite | 3 passed, 0 failed | artifacts/governance-v2/P05-F04-feature-browser-final.log and P05-F04-feature-browser-final.json |
| Final lint including corrected browser fixture | Exit 0 | artifacts/governance-v2/P05-F04-lint-verified.log |

P05-F04-S01–S10 verify disk persistence/provenance; inheritance and blocked/stale overrides; retries, immutable versions/heads and retired-key safety; roles/tenants/suspended accounts; original snapshots on a cancelled request in a closed encounter across terminology/catalog updates and reopen; unknown/invalid/expired/unit/drug/stale-selection rejection; atomic outbox and order-pin failure; migration-47 failure/recovery; dependency/production/default-deactivation gates; and facility-manager/default/other-facility restrictions. Audit ledger integrity is verified after historical order reads and mutation-denial scenarios. A new terminology release may explicitly advance under the same canonical system/code identity; existing pins remain unchanged.

The first targeted run passed 8 of 9 cases. The facility-inheritance test had changed an administrator's context to a facility where that actor was not authorized. The permission gate correctly denied it. The fixture now uses the actual laboratory account in that facility, retaining the intended isolation checks. The targeted run then passed 10/10 (including an added facility-manager test); the final full run passes all 430. No assertion was weakened or failed result relabeled. Current schema-head expectations advance to 47; historical rollback target assertions remain intact after newest fixture teardown. Legacy “phase PASS” output is implementation evidence, not formal phase acceptance.

The first full browser run passed 18/19. The request-flow fixture extracted the final URL segment without removing ?notice=started and consequently navigated with an invalid encounter ID. The Playwright trace records the malformed URL; the test now extracts the encounter ID from URL.pathname. Application code and acceptance assertions were unchanged. The corrected final catalog feature suite passed 3/3. Existing 16 clinical/billing, F01–F03, landing/login, fixed-sidebar/table/account and portal scenarios passed on schema 47 in the combined run. Thus all 19 distinct browser scenarios have passing final evidence; the intermediate failed result remains preserved, not relabeled.

The live browser scenarios use actual Foundation sessions, APIs and local SQLite records without catalog mocks. They exercise UI registration and next revision, nurse booking/arrival, clinician encounter/request/closure, original catalog snapshot after default deactivation, inactive/stale override blocking, drug metadata labeling, concurrent revision CAS (201/409), role/tenant/scope-injection and foreign-Origin denial. Automated Axe checks pass on catalog and order provenance; the 390px overflow assertion passes. Desktop/mobile screenshots under artifacts/governance-v2/P05-F04/preserved-order-desktop.png and preserved-order-mobile.png were visually inspected. Generated Next configuration changes were restored, and git diff --check reports no whitespace errors.

Executed commands (logs redirected to the artifact paths above):

```powershell
node --import tsx --import ./packages/domain/test/dev-env.ts --test packages/domain/test/facility-catalogs.test.ts
npm test
npm run typecheck
npm run lint
npm run governance:test
npm run governance:v2:test
$env:CURASPHERE_NEXT_DIST='.next-p04f05'
npm run build
$env:CURASPHERE_E2E_BASE_URL='http://127.0.0.1:3000'
npx playwright test tools/e2e/p05-f04.spec.ts tools/e2e/p05-f03.spec.ts tools/e2e/p05-f02.spec.ts tools/e2e/p05-f01.spec.ts tools/e2e/p04-f05.spec.ts tools/e2e/premium-ui.spec.ts tools/e2e/workspace-polish.spec.ts
npx playwright test tools/e2e/p05-f04.spec.ts --output artifacts/governance-v2/P05-F04-feature-retest
```

## Remaining restrictions

Local synthetic engineering only. No qualified clinical/regulatory/licensing review is supplied by fixture roles, catalog permissions or automated checks. Formal Phase 02 reviews remain pending; formal Phase 04 remains NOT_STARTED. No real PHI, prescribing/dispensing, external order/provider, payment collection, production clinical activation, push, merge, publication or deployment is enabled/performed. P05-F05 picker conformance and formal Phase 05 exit remain unfinished.

See P05-F04-plan.md and P05-F04-architecture-and-operations.md for ADR, API/event contracts, user guidance, risk controls, permission boundaries, monitoring, failure behavior and rollback. Backup details are in artifacts/governance-v2/P05-F04-backup.log. Operational rollback retains all immutable data; fixture teardown is never a live downgrade shortcut.
