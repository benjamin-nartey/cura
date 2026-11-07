# P07-F04 — Timeline frontend evidence

Local synthetic engineering verified 2026-11-04. Formal Phase 07 remains NOT_STARTED; qualified prerequisite, clinical, privacy, architecture and licensing reviews remain pending. Production clinical functions remain disabled.

## Delivered behavior

Shared cards expose source versions, actual provenance, amended/historical badges and explicit missing time/metadata across canonical, filtered, before/after and materialized views. Clinical and recorded dates remain distinct. Canonical latest-version display has an explicit history toggle, date anchors and roving keyboard navigation.

A shared accessible source dialog reauthorizes every inspection and checks exact event, ledger, version and SHA before rendering structured source values or optional raw JSON. Escape, request cancellation, explicit forward/reverse Tab wrapping and trigger/fallback focus restoration are supported. Formerly current evidence can remain explicitly historical while old lists clear. Unverified/mismatched, denied and late responses never render clinical facts.

Patient-scoped connection/source epochs gate rendering synchronously, clear views on offline/uncertainty/restoration and require explicit refresh after reconnect. No offline clinical storage or replay queue is added. The readonly authenticated same-origin no-store source-check endpoint returns only canonical hash, operational checkedAt and version count, with IDs-only success audit. Bounded visible/online 30-second and focus checks invalidate changed/unknown context; the UI does not claim a live feed. Existing projection source-match guards remain intact. No database migration or source execution was added.

## Actual verification

Artifacts below are under `artifacts/governance-v2/`.

| Executed check | Observed result |
| --- | --- |
| Full domain `npm test` | 536 pass, zero failures — `P07-F04-domain-final.log` |
| `npm run timeline:frontend:test` | Six focused freshness/presentation cases pass — `P07-F04-focused.log`; three domain cases overlap the full suite |
| Live F01/F03/F04 browser suite | 12 pass — `P07-F04-browser-final.log`, `.json`; real source corrections, historical evidence, filters/snapshots/comparisons, unknown metadata, keyboard/modal focus, Axe, 390-pixel containment, stale hash invalidation, offline/reconnect, denied/mismatched source and delayed cancellation |
| Actual Metro mobile/browser/API regressions | Four pass — `P07-F04-mobile.log`; this run archived in `P07-F04-mobile-workspace-regressions/` |
| Existing shipped worker and materialized inspection | Actual Foundation-authorized worker consumes eight new versions; current projection 133 events, exact source/cache hashes; materialized source modal inspection, Escape and link focus pass — `P07-F04-worker-smoke.json`, `.log`, executable `.cjs` |
| Conformance | Eight pass — `P07-F04-conformance.log` |
| Governance | 16 v2 and ten local/review pass — `P07-F04-governance.log`, `P07-F04-governance-local.log` |
| Types | Full contracts/domain/FHIR/web and native mobile pass — `P07-F04-types-complete.log`, `P07-F04-mobile-types.log`; final domain source/test types `P07-F04-domain-types-final.log`; final web changes additionally compiled in optimized build |
| Lint/build | Final scoped lint and optimized build pass — `P07-F04-lint-complete.log`, `P07-F04-build-focus-fix.log` |
| Original-row preservation | Schema 53 unchanged; all original primary keys and column values retained across 33 clinical/provenance/integration/SMART/batch/component/appointment/projection/snapshot tables — `P07-F04-preservation.json`, `.py` |

Screens `P07-F04/source-dialog-desktop.png` and `source-dialog-phone.png` were visually inspected. Prior F01/F03/mobile shared evidence was backed up and restored; this run has separate regression archives. Consistent pre-feature snapshot: `P07-F04-before.sqlite`. New synthetic encounters, observations, source versions, snapshots and derived processing receipts remain in place; no clinical cleanup deletes were performed. Both Next-generated config files match the SHA-256 hashes captured in `P07-F04-start-hashes.json`.

## Defects found and resolved

The first browser run found native-dialog Tab traversal could leave document focus after cycling through controls. Explicit wrapping fixed this; the final complete twelve-scenario run passes. Initial logs/traces remain in `P07-F04-browser.log` and `P07-F04-browser-output/`.

The initial full suite exposed an existing population privacy-test flake: searching the whole response for a withheld value `148` also matched a permitted timestamp ending `.148Z`. The test now fixes operational Date to that exact case, asserts that timestamp separately and checks the response excluding only that allowed timestamp. Original name/measurement/suppression checks remain; population runtime is unchanged. Initial failing `P07-F04-domain.log` and targeted passing `P07-F04-population.log` are retained. The final full suite passes all 536 cases.

Real browser tests create new synthetic observations at 37.1 and correct them to 37.6 and 37.8 through the actual authorized correction endpoint. Previously stored clinical source rows are not edited. A formerly current exact v1 response is historical; old lists clear and explicit refresh shows the latest version. An actual source hash change triggers manual freshness invalidation. Isolated interception is used only for error, untrusted-payload and delayed-response UI cases, not as clinical data evidence.

## Scope and remaining work

[Plan](P07-F04-plan.md), [architecture and operations](P07-F04-architecture-and-operations.md), [risk controls](P07-F04-risks.md), [scenarios](P07-F04-scenarios.json), [ADR-0079](../adr/ADR-0079-source-linked-safe-timeline-ui.md).

Source checks detect changes within polling/focus opportunities; they are not real-time guarantees. Existing 500-version read bounds and snapshot/authorization constraints remain. No additional official FHIR validator execution is needed or claimed for these custom frontend/metadata changes: R4 serialization is unchanged, previous eleven-case official evidence remains intact and conformance regressions pass. Remote CI has not run this uncommitted work.

P07-F04 engineering is verified; qualified formal acceptance remains pending. P07-F05 lag/alerting/Kafka work remains NOT_STARTED. No commit, push, merge, publication, deployment or production activation was performed.
