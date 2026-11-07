# Phase 03 experimental closeout

This is the final experimental engineering assessment for Phase 03. It is not formal acceptance. Phase 02 remains IN_PROGRESS. Formal Phase 03 remains NOT_AUTHORIZED. The formal phase register remains NOT_STARTED. DEV-GOV-2026-001 remains PROPOSED. P02-R01 through P02-R06 remain PENDING. Phase 04 remains NOT_STARTED. The local runner reports `permitted_feature=none`. The amendment hash remains `b0cb7581996daf6f212991086e4cc58772cf76a80d5075c23dec60aa84ea27c8`.

This closeout did not rerun the full domain, web, gateway, or foundation suites. Those results are cited from the feature evidence that recorded them. The fresh checks in this closeout are the chart read, the foundation identity read, and `verifyAccessLedger` for `org_demo_gh` and `org_demo_eu`.

## 1. Completion matrix

| Feature | Experimental status | Formal status | What the evidence shows | Evidence |
| --- | --- | --- | --- | --- |
| P03-F01 Immutable access ledger | EXPERIMENTAL_ENGINEERING_COMPLETE | NOT_STARTED | Append-only hash chain, auditor-only read, metadata-only rows. Domain suite at that time: 215 passed. | docs/privacy/P03-F01-experimental-evidence.md |
| P03-F02 Consent | EXPERIMENTAL_ENGINEERING_COMPLETE | NOT_STARTED | Grant, version history, withdrawal, blocked dispatch, research denial. Domain suite at that time: 236 passed. Browser S33–S36. | docs/privacy/P03-F02-evidence.md |
| P03-F03 Retention and legal holds | EXPERIMENTAL_ENGINEERING_COMPLETE | NOT_STARTED | Jurisdiction profiles, dry-run, hold precedence, idempotent disposal, tombstone. Domain suite at that time: 246 passed. | docs/privacy/P03-F03-evidence.md |
| P03-F04 DSAR and bulk export | EXPERIMENTAL_ENGINEERING_COMPLETE | NOT_STARTED | Identity binding, two-person bulk approval, wrong-subject denial, private artifact, expiry, revocation, large-export monitoring. Domain suite at that time: 253 passed. | docs/privacy/P03-F04-evidence.md |
| P03-F05 Privacy telemetry | EXPERIMENTAL_ENGINEERING_COMPLETE | NOT_STARTED | Application allowlist, Collector redaction, canary absence from the inspected sinks, alert lifecycle, restricted screens, Collector stop and restart. Domain suite: 258 passed. Gateway: 7 passed. Foundation: 24 tests, 0 failures. | docs/privacy/P03-F05-evidence.md |

## 2. Source exit criteria

| Criterion | Engineering result | Limit |
| --- | --- | --- |
| Every sensitive read/write is attributable | Chart writes that call `writeAudit` or `appendAccessLedger` land on the hash chain. Consent, retention, DSAR, telemetry, and chart patient actions use that path. Fresh check: `org_demo_gh` and `org_demo_eu` both returned `intact: true`. The Ghana chain has 83 rows. | Services that do not call those functions are not covered. The AI gateway denial is a local log and span, not a chart ledger row. Foundation authentication is a separate Postgres database. This is not a claim that every process on the machine writes a ledger event. |
| Retention policies are configurable by jurisdiction | `SYNTHETIC_GH`, `SYNTHETIC_EU`, and `SYNTHETIC_DEFAULT` are stored profiles with approval state `pending_policy_approval`. | The durations are engineering simulations. They are not approved production retention periods. |
| Break-glass and bulk export receive special monitoring | Large export `exp_expafec4fd5133042a3` is `monitoring=large`, 4900 records. Alert `alt_b1677a603f4e4ca2` is `sig.export.large`, resolved, version 4, disposition `confirmed`. Emergency denial rule `sig.emergency.denied` is seeded with synthetic threshold 3 and was covered by the domain telemetry tests. | The browser session inspected the export alert. It did not open a new break-glass incident. Grafana was not running. |

## 3. Regression summary

Last full commands, from P03-F05 evidence, not repeated here:

- Domain: 258 passed, exit 0.
- Gateway unittest: 7 passed, exit 0.
- Foundation `./gradlew test --offline`: 24 tests, 0 failures, exit 0.
- Web typecheck and production build: exit 0.
- npm audit for domain and web: vulnerability total 0.
- Governance tests: 10 passed, exit 0.
- Local runner: `permitted_feature=none`, Phase 02 `IN_PROGRESS`, formal Phase 03 `NOT_AUTHORIZED`, exception `PROPOSED`, amendment hash matches.

Fresh closeout commands:

- Chart read of `data/curasphere.sqlite` on 15 October 2026: schema 37.
- `verifyAccessLedger` for `org_demo_gh` and `org_demo_eu`: `intact: true`.
- Foundation Postgres `127.0.0.1:5432/curasphere`: Flyway version 16. The five Phase 03 directory personas are present.

## 4. Residual risk register

| Item | Classification | Status |
| --- | --- | --- |
| 44 Debian high findings, R-IMG-DEBIAN | Blocks production deployment. Does not block the recorded experimental engineering. | OPEN. Not accepted. |
| Hosted GitHub CI, R-CI | Blocks formal phase acceptance and production deployment. Local tests are not a substitute. | OPEN. |
| Prometheus and Grafana not running | Blocks a claim of live metrics dashboards. The Next privacy screens were the exercised view. | UNVERIFIED. |
| Jurisdiction retention profiles | Blocks production retention. Experimental engineering may use the synthetic profiles. | `pending_policy_approval`. |
| P02-R01 through P02-R06 | Blocks formal Phase 02 and Phase 03 acceptance. | PENDING. No reviewer name. |
| Clinical role matrix, P02-R04 | Blocks production clinical privileges. | PENDING. |
| Production emergency-access policy, P02-R05 | Blocks production break-glass. Local synthetic emergency rules are engineering thresholds only. | PENDING. |
| SQLite chart and local-only Collector debug exporter | Blocks production deployment and any claim of an approved external telemetry destination. | Local experimental limitation. |
| DEV-GOV-2026-001 | Blocks formal development-mode activation. | PROPOSED. |
| Canary coverage | Does not prove every historical log, backup, or browser extension is free of protected data. | Coverage limit. Not a pass for untested sinks. |
| Accessibility | Keyboard labels and a 390px heading check were done. An automated axe run was not. | Partial. Not a full accessibility pass. |

## 5. Fixture reproducibility

`data/curasphere.sqlite` is gitignored. A clean checkout does not contain the live scenario rows.

Present in the live chart on this closeout:

- Schema 37.
- Consent `cns_50673cab-bc9d-4d41-8acb-ab31e9c4acd8` withdrawn at version 3.
- Hold `hold_hold293e3f3c90fc4b9a` active. Hold `hold_holdc926d2da614341be` released.
- Retention tombstones: 1.
- Export `exp_exp63aec6ff27354c71` expired, artifact access `cleaned`, payload length 0. The expired-download denial was observed in the P03-F04 browser session and was not repeated as an HTTP call in this closeout.
- Export `exp_expafec4fd5133042a3` ready, monitoring `large`, 4900 records, artifact payload length 427823.
- Privacy alert `alt_b1677a603f4e4ca2` resolved.
- Telemetry sink: 1 sanitized row. Collector health: ready, destination `local-debug`.
- Patients: 13 in `org_harborlight`, 3 in `org_northwind`, 0 in `org_demo_gh` and `org_demo_eu`.

Chart users for the Phase 03 personas are inserted by domain seed code when the chart opens. Foundation Flyway migrations through version 16 do not insert `usr_gh_privacy`, `usr_gh_records`, `usr_gh_legal`, `usr_gh_reviewer`, or `usr_gh_reception`. Those five ids exist in the local foundation database. A rebuilt foundation database would not show them on the directory until the same local insert is repeated. They are not formal production identity records.

Akua Boateng is a `consent_subjects` row. The DSAR cohort is `privacy_subjects`. Neither is a row in `patients`. The Harborlight and Northwind patient rows are synthetic chart fixtures with a version integer. They are not an approved clinical source record set.

## 6. Stop

P03-F01 through P03-F05 stay complete in the experimental register only. Phase 04 coding has not started. The proposed Phase 04 scope in `docs/governance/PHASE-04-EXPERIMENTAL-SCOPE-PROPOSAL.md` is not activated.
