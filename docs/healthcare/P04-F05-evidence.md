# P04-F05 engineering evidence — 2026-11-03

Status: EXPERIMENTAL_ENGINEERING_COMPLETE. Formal acceptance remains blocked by pending human governance reviews; formal Phase 04 remains NOT_STARTED. This record is software evidence for the authorized local synthetic experiment, not a clinical, regulatory, financial, or governance approval. No push, merge, publication, or deployment was performed.

## Completed scope

The pre-existing uncommitted schema 42 billing slice was preserved and completed rather than duplicated. `packages/domain/src/billing.ts` implements fictional catalog-priced charges, item snapshots, adjustment/void history, review and local finalization, scoped reads, optimistic concurrency, transactional commands, audit and stored metrics. Clinical and financial grants remain separate. No payment/claim provider or AI call is introduced.

`packages/domain/src/db.ts` adds schema 43 integrity guards for existing schema 42 databases and closes failed migration connections. Version and adjustment history is immutable. Earlier rollback helpers now remove the dependent 43 marker. The billing rollback test reopens the same on-disk database and proves patient/encounter preservation. A separate fault-injection test proves a failed additive migration has no 43 marker and can recover.

`packages/domain/src/patient-chart.ts` and the chart page aggregate existing authoritative sources. Pending work is filtered by selected patient in all four queries in `work.ts`. Wrong-patient encounters are not rendered. Blood-pressure components include values/units and observations include effective time/version. Clinical medication drafts stay non-executable. Section empty/denied/failed states, loading, top-level error and retry are explicit. The mobile chart precedes navigation, with a navigation jump link; other workspaces retain their layout.

The billing form adapters hash complete tuples instead of truncating identifiers and distinguish intentional new submissions using a form token. Replays validate current facility visibility and check commands again inside the write transaction. `experimental-healthcare.ts` requires the local synthetic sandbox for billing and unified chart reads. Financial permission failures use the attributable authorization decision log. Billing list reads are audited.

Existing fixed October appointments had become past dates. `test/fixture-clock.ts` freezes only the affected Phase 04 test files and their race workers; the application still rejects past booking. Windows deployment-denial tests now select Git Bash rather than an unavailable WSL alias. Next.js was patched from 16.4.0 to 16.4.4 following the npm advisory report.

## Executed verification

| Command | Observed result / evidence |
| --- | --- |
| `npm test` | 391 passed, 0 failed, duration 206434.9246ms; `P04-F05-domain-test.log`. |
| `node --import tsx --import ./test/dev-env.ts --test test/billing.test.ts` from `packages/domain` | 18 passed, 0 failed; `P04-F05-billing-test.log`. Includes actual two-process duplicate submission, immutable versions, scoped access, stale writes, dependency outage, same-file rollback/reopen, and failed-upgrade recovery. |
| `npm run test:e2e:p04f05` | 2 passed; `P04-F05-e2e.log` and `P04-F05-e2e-results.json`. |
| `npm run typecheck` | Exit 0 for contracts, domain, FHIR and web; `P04-F05-typecheck.log`. |
| `npm run build` | Exit 0 on Next.js 16.4.4; final normal-directory build recorded in `P04-F05-build.log`. |
| `npm run governance:test` | 10 passed, 0 failed; `P04-F05-governance-test.log`. |
| `node --test tools/platform/contract-compat.test.mjs tools/platform/signing.test.mjs tools/platform/delivery-static.test.mjs` | 5 passed, 0 failed; `P04-F05-platform-test.log`. Deployment refusal was exercised before any deployment tool executes. |
| `npm audit --json` | Zero vulnerabilities; `P04-F05-audit.json`. |
| `node tools/governance/local-experiment.mjs` under the four sandbox variables with `EXPERIMENT_STATUS_PATH=docs/healthcare/P04-F05-local-experiment.json` | Exit 0; `permitted_feature=none`, amendment hash unchanged, all six human reviews PENDING, formal exception PROPOSED. |

Initial failures were investigated and corrected, not counted as passing evidence: past fixture dates, sandbox denial of localhost Dex, missing Windows WSL Bash, schema 43 rollback markers, cold browser compilation timeouts, and ambiguous selectors in a chart containing prior visits and development tooling. The initial build needed network access for the existing Google fonts. Final evidence files contain the latest executed result.

## Browser scenario

The browser used the actual web app on localhost:3105, a dedicated `data/p04f05-e2e.sqlite`, and the existing local PostgreSQL foundation service. No HTTP or persistence service was mocked. The synthetic billing officer was added to the local foundation directory through `seed-p04-f05-directory.sql`; chart fixtures came from `seed-p04-f05.ts`.

1. Nurse books a future follow-up for synthetic Kofi Mensah, confirms and records arrival.
2. Doctor starts the encounter, records blood pressure 138/86 mm[Hg], and reads the resulting source record in the unified chart.
3. Chart shows source values and status without financial amounts. axe checks report zero violations at desktop and 390×844; mobile horizontal overflow is absent and patient identity appears within the first 400px.
4. Doctor closes the encounter; ordinary vital recording is refused after closure. Financial charge screens are denied to the doctor.
5. Billing officer creates GHS 150.00 fictional consultation charge. Repeating the same form returns the same charge URL, then review and local finalization succeed. Clinical entry screens are denied to the billing officer.
6. Second patient chart truthfully shows absent source information and no other patient's pending work. A same-name foreign-tenant chart is unavailable.

Screenshots: `P04-F05-chart-desktop.png`, `P04-F05-chart-mobile.png`, `P04-F05-charge.png`. Screenshots were visually inspected. Failed attempts retain traces in ignored `test-results/`. Scenario oracles: `tools/fixtures/p04-f05-scenarios.json`; added regression IDs S50–S54 live in `billing.test.ts`.

## Safety, operation and residual issues

Wrong-patient hazard is controlled by tenant/facility/patient checks, filtered pending work, and identity headers. Financial disclosure is controlled by separate grants and facility checks before command replay. Lost updates are controlled by expected-version checks and immediate write transactions. False payment obligations are controlled by fictional labels and unconditional transmission/collection denial. Missing clinical data remains unknown, never a fabricated normal finding.

Schema 43 is additive. Synthetic billing rollback is intentionally destructive to fictional billing rows and preserves earlier patient/encounter/work sources. Billing dependency failure rejects writes; a chart billing-section failure retains readable clinical sections. Counters are tenant/facility scoped and contain no patient names, measurements, or amounts. No production SLO, clinical validation, or load-capacity claim is made from these local tests.

Phase 02 reviews P02-R01–P02-R06 remain pending, DEV-GOV-2026-001 remains PROPOSED, formal Phase 04 remains NOT_STARTED, and production/staging clinical and financial activation remain unauthorized. Existing governance risks (including hosted CI and image review) remain open. Hosted CI, foundation Gradle, native mobile, and the AI gateway suite were not rerun as part of this bounded feature; no changes to their implementation are claimed. Phase 05 was not started.

Design and operator references: `ADR-0070-billing-primitives-and-chart-ux.md`, `P04-F05-contract-v1.md`, `P04-F05-completion-plan.md`, `P04-F05-runbook.md`, `billing-primitives.md`, and `unified-patient-chart.md`.
