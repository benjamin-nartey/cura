# P03-F03 experimental evidence

This is experimental engineering evidence. Formal Phase 03 remains NOT AUTHORIZED. DEV-GOV-2026-001 remains PROPOSED. The amendment hash remains `b0cb7581996daf6f212991086e4cc58772cf76a80d5075c23dec60aa84ea27c8`.

## What was built

Chart schema 35 stores versioned synthetic retention policies, disposable records, tombstones, archive checksums, legal holds, dry-run plans, and retention jobs. `evaluateRetention` returns retain, review required, archive eligible, purge eligible, hold blocked, policy missing, policy conflict, or error. Disposal and archive run only from a stored preview. Execution checks the plan hash, the preview expiry, and the hold/policy revision before it changes a row. A non-active row is skipped as already finished. A hold or policy change after the preview writes `retention.blocked` and does not delete.

Seeded profiles are `SYNTHETIC_GH`, `SYNTHETIC_EU`, and `SYNTHETIC_DEFAULT`. Their approval state is `pending_policy_approval`. They are not statutory retention periods. Audit-ledger and consent-history categories stay protected. The local archive is a checksum row, not an object-storage conformance claim.

Actors at Accra Central Medical Centre (`org_demo_gh` / `fac_gh_accra`): Adjoa Frimpong (`usr_gh_records`) executes disposal, Yaw Owusu (`usr_gh_legal`) creates and activates holds, Kojo Asante (`usr_gh_privacy`) releases holds and does not execute, Esi Boateng (`usr_gh_reviewer`) reads activity, and Yaa Asare (`usr_gh_reception`) is denied. The matter reference used in the browser was `SYN-RETENTION-CASE-001`.

## Browser workflow

Adjoa created `ret_rec13a9ef03d5f44a928559`, started 2026-10-01, and the record page showed `purge_eligible` under `pol_syn_gh_temp` v1 / `SYNTHETIC_GH`. Preview `dry_06413bd1-3c80-4f15-96a8-5e0963217994` showed Eligible 1 and the text that a preview is not a deletion.

Yaw created and activated `hold_holdc926d2da614341be` on that record. Adjoa’s execution of the old preview returned `error=conflict` and the stale-preview message. The record stayed active and showed `hold_blocked`. Kojo released the hold. The page showed released by `usr_gh_privacy`, reason `investigation-closed`, and said disposal still needs a new preview. The old preview still conflicted. A new preview, `dry_3ca3b816-9a89-4832-baab-c3c60e039ca5`, executed with notice `disposed`. The record URL then said the record is not available. The overview showed Disposed 1. A later execution of that same preview returned notice `unchanged` and did not add a tombstone.

Esi opened `/privacy/retention/activity` and saw the ledger actions, including `retention.dispose` and `legal-hold.release`, with no execute form. Yaa opened `/privacy/retention` and saw “Retention records are limited to authorized staff.” Retention was not in her navigation. Kojo’s preview page had Create preview and no execute form. Adjoa’s policy matrix warned that the rules are synthetic and showed `pending_policy_approval`, with no save control.

A second record, `ret_reccb253501d5c64e1cbbb7`, was previewed as `dry_099370de-0787-4813-8d90-d0957d4768ce`, then placed under active hold `hold_hold293e3f3c90fc4b9a`. Executing that preview returned the conflict message. The row is still `active`. The ledger has `retention.blocked` / `denied` for `usr_gh_records` on that id.

A separate process reopened `data/curasphere.sqlite`. Schema was 35. The first record was `disposed` at version 2 with one tombstone. Akua Boateng’s consent `cns_50673cab-bc9d-4d41-8acb-ab31e9c4acd8` was still `withdrawn` at version 3. `verifyAccessLedger` for `org_demo_gh` was intact. Disposal events for the first record numbered 1.

## Commands

- `npm test --workspace @curasphere/domain`: 246 passed, 0 failed, exit 0.
- `npm run typecheck --workspace @curasphere/domain` and `@curasphere/web`: exit 0.
- `npm audit --workspace @curasphere/domain` and `@curasphere/web`: 0 vulnerabilities, exit 0.
- `npm run build --workspace @curasphere/web`: exit 0. Retention pages were in the route list.
- `npm run governance:test`: 10 passed, 0 failed, exit 0.
- `npm run governance:local-experiment` in the local sandbox: exit 0. `permitted_feature=P03-F04`, `formal_phase02=IN_PROGRESS`, `formal_phase03=NOT_AUTHORIZED`, `formal_exception=PROPOSED`, `amendment_hash_matches=true`. P02-R01 through P02-R06 remained PENDING. R-IMG-DEBIAN, R-CI, R-GOVERNANCE, and R-CLINICAL-DEFAULTS remained OPEN.

## Scenarios

S01–S33 and S39–S40 passed in `packages/domain/test/retention.test.ts`, including missing policy, conflict, jurisdiction isolation, stale and tampered plans, hold-after-preview, hold during the worker, archive failure, idempotent disposal, resume, outage, ledger protection, consent withdrawal, and restore reconciliation. S34 is the cross-tenant assertion in the S09–S17 test: a European actor receives not-found for the Ghana hold and an empty hold list. S35–S38 passed in the browser session above. No unexecuted scenario is marked passed.

S26 was checked by a second execution key after disposal. The tombstone count stayed at the number of disposed rows. Two operating-system processes were not launched against one row. The disposal update is conditional on the active lifecycle and the current version, in the same transaction as the tombstone.

## Residual limits

Hosted CI remains unverified. The 44 high Debian findings in the gateway image remain open. Production and staging destructive retention stay disabled. No production retention period is approved. The local archive checksum does not prove that backups outside this database were sanitized. Directory rows for Adjoa Frimpong and Yaw Owusu are local foundation data, not a Flyway migration. The next feature is P03-F04, DSAR and bulk export. It is not started.
