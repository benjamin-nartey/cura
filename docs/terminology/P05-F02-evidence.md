# P05-F02 engineering evidence — 2026-11-03

Status: ENGINEERING_VERIFIED_REVIEW_PENDING. Formal acceptance not granted.

## Implemented scope

Schema 45 persists immutable organization-scoped value-set versions and exact controlled-release members. Registration includes actor/payload-bound retries, duplicate-version conflict, manifest hash, sealed pins, append-only audit and transactional outbox. Existing global value sets, clinical source references and records remain unchanged.

Membership validation requires a value-set ID and exact system/version/code. Unknown, nonmember, ineffective and reference-only concepts fail safely. Unit inspection uses the versioned restricted mathematical pack with rational scale/offset arithmetic, explicit dimensions and decimal-string rounding. No general UCUM conformance, clinical interpretation, licensed terminology import or clinical record mutation is claimed.

API routes: /api/terminology/value-sets, /api/terminology/validate and /api/terminology/convert. Web: /terminology/validation and /terminology/value-sets/[id], linked from the registry. Mobile: existing separately authenticated registry web handoff. Registration requires terminology.manage; inspection requires terminology.read, active scope/account and local synthetic gate.

## Observed verification

| Check | Result | Evidence |
| --- | --- | --- |
| npm test | 411 passed, 0 failed | artifacts/governance-v2/P05-F02-domain.log |
| npm run typecheck | Exit 0 | artifacts/governance-v2/P05-F02-typecheck-final.log |
| Repaired production build with CURASPHERE_NEXT_DIST=.next-p04f05-build | Exit 0 | artifacts/governance-v2/P05-F02-build-repaired-final.log |
| npm run lint after repairs | Exit 0 | artifacts/governance-v2/P05-F02-lint-final-verified.log |
| npm run governance:test and npm run governance:v2:test | 10 and 16 passed | artifacts/governance-v2/P05-F02-governance.log |
| Local migration preservation check against consistent schema-44 backup | Schema 45; all 21 original patient IDs and 8 original release IDs retained | artifacts/governance-v2/P05-F02-migration-preservation.log |
| Existing clinical/billing, F01 terminology, enterprise/login and workspace/portal browser scenarios on repaired schema-45 build | All 10 compatibility scenarios passed | artifacts/governance-v2/P05-F02-browser-final.log |
| New feature browser scenarios after selector corrections | 3 passed | artifacts/governance-v2/P05-F02-feature-browser-verified.log |
| Final production build with shared input styling | Exit 0, includes TypeScript check | artifacts/governance-v2/P05-F02-build-verified.log |
| Final lint with completed feature tests | Exit 0 | artifacts/governance-v2/P05-F02-lint-verified.log |
| Final feature browser run against the final styled build | 3 passed, 0 failed | artifacts/governance-v2/P05-F02-final-ui.log and P05-F02-final-ui.json |

Executed commands (logs/reports redirected to the artifact paths above):

```powershell
npm test
npm run typecheck
npm run lint
npm run governance:test
npm run governance:v2:test
$env:CURASPHERE_NEXT_DIST='.next-p04f05'
npm run build
$env:CURASPHERE_E2E_BASE_URL='http://127.0.0.1:3000'
npx playwright test tools/e2e/p05-f02.spec.ts tools/e2e/p05-f01.spec.ts tools/e2e/p04-f05.spec.ts tools/e2e/premium-ui.spec.ts tools/e2e/workspace-polish.spec.ts
npx playwright test tools/e2e/p05-f02.spec.ts --output artifacts/governance-v2/P05-F02-final-ui
```

P05-F02-S01–S09 domain scenarios cover persistent reopen/provenance, retry/conflict/immutability/sealed members, two-tenant/role/suspended-account restrictions, unknown/nonmember/wrong-version/expired/duplicate references, exact scale/offset/tie-rounding golden oracles, incompatible dimensions/ambiguous symbols/input bounds/unsupported versions, atomic outbox failure, injected migration failure/recovery and dependency/production denial. Access-ledger integrity is verified after successful and denied inspection.

The first targeted run passed 8 of 9 scenarios. The expiry test mistakenly reused a successful registration's idempotency key and encountered the expected conflict before reaching expiry validation. A separate command key/version fixed the test setup; the full 411-test run passes. Initial type checking also identified unsupported error taxonomy strings; the implementation now uses the repository's existing ValidationError codes, and final checking passes. Original logs remain available; no failed result is relabeled as passing.

The first combined browser run reported 9 passes and 4 failures. Two failures exposed a real nonempty-list rendering defect: SQLite returns null-prototype rows, which cannot cross the React server/client boundary. The validation page now explicitly maps only id/name/version/member_count into plain client props. Two regression failures exposed insufficient contrast in white labels on occupied/open dashboard activity bubbles at the shared font size; darker scoped colors fix the contrast. Assertions were retained. The final production build includes both fixes, and the browser suite is rerun against that build. A concurrent API retry scenario also verifies that two overlapping value-set registrations yield one shared receipt with 201/200 outcomes.

Subsequent feature test failures were selector ambiguities: wrapped select labels and the input sharing “Value-set version”, then Next's separate route-announcer alert matching a global error locator. Tests now identify textbox/combobox roles and scope error assertions to the main landmark. No success, authorization, numeric, concurrency, accessibility or responsive assertion was removed. The corrected three-scenario run passed. Visual inspection then prompted explicit type=text on new inputs to apply the existing shared input styles; final build and feature-browser verification are recorded separately.

Final verification covers 13 distinct browser scenarios across the 10 passing compatibility scenarios and the 3 passing final feature scenarios. The combined intermediate report still truthfully contains its two selector failures; the separate final feature report establishes their passing retest. Desktop and 390px screenshots are saved as artifacts/governance-v2/P05-F02/validation-desktop.png and validation-mobile.png. Automated Axe checks and the narrow-screen document-overflow assertion pass. Screenshots were visually inspected; new inputs use shared styling.

Historical rollback fixtures continue to test their original downgrade targets after removing the new fixture-only extensions. Current schema-head assertions now expect 45; historical scenario identities and protected evidence are unchanged. Legacy test output containing “phase PASS” is an implementation check, not formal phase acceptance.

## Remaining restrictions

Formal Phase 02 reviews remain pending and formal Phase 04 remains NOT_STARTED. Original protected registers and governance authorization/evidence remain unchanged. Clinical, regulatory and licensing reviews are not simulated. No external healthcare/provider call, real PHI, push, merge, publish or deployment was performed. Mapping adjudication (P05-F03), facility formulary/catalogs (P05-F04), and conformance UX (P05-F05) remain later work.

See P05-F02-architecture-and-operations.md for contracts, intended use, unit-pack boundaries, risks, user help, monitoring, failure behavior and rollback. Backup details are in artifacts/governance-v2/P05-F02-backup.log. Operational rollback retains data and disables new routes; destructive fixture teardown is never a live downgrade procedure.
