# P04-F05 runbook

Experimental operations only. Do not use these steps on production or real patient data. No charge creates a payment obligation.

## Wrong-patient chart

Close the session or open the intended patient chart URL. Confirm MRN and facility in the header before recording. Do not reuse a prior browser tab after a patient switch without a full reload.

## Incorrect charge

Void the charge with a reason while the officer still has `billing.charge.void`. Create a corrected charge. Do not edit historical versions in place.

## Duplicate financial record

Compare `billing_commands` for the submission key. One `billing_charges` row is the expected result. Do not delete the row after a repeated click.

## Unauthorized billing access

Backend denial is expected. Confirm facility membership role. Organization administrators do not inherit charge privileges.

## Concurrent financial update

The second officer loaded a stale version. Reload the charge and resubmit with the current version. Totals must stay consistent with `billing_versions`.

## Missing clinical information

Empty chart sections mean no recorded source. Do not invent findings. Check facility and permission if a section shows denied or failed.

## Partial chart load

Retry the page. Failed section names appear in the alert. Other sections remain authoritative.

## Database failure

`billing_controls.dependency = unavailable` rejects new charges before a row is written. Restore `available` only after writes succeed.

## Audit inconsistency

Run `verifyAccessLedger`. Do not rewrite charge rows to “fix” the ledger.

## Failed migration

`BILLING_ROLLBACK` drops schema 42/43 billing tables and leaves migration head at 41. Opening the database again applies schemas 42 and 43. Re-seed catalog controls with `seedBillingPrimitives`. It does not drop work or clinical source tables.

## Synthetic billing rollback

Use `BILLING_ROLLBACK` only in local synthetic databases. Recreate catalog and billing officer through `seedBillingPrimitives` after upgrade.

## Failed deployment recovery

Keep production and staging clinical and billing processing disabled. Do not promote experimental schemas 42/43 as formal Phase 04 acceptance.

## Verification environment

Seed the dedicated chart with `node --import tsx tools/fixtures/seed-p04-f05.ts` under all four local synthetic override variables. Use `DATABASE_PATH` pointing to `data/p04f05-e2e.sqlite` and `CURASPHERE_NEXT_DIST=.next-p04f05` for the web server on port 3105. Keep the default chart database separate. The existing foundation service on localhost:8081 and Dex on localhost:15556 are integration dependencies. Apply `tools/fixtures/seed-p04-f05-directory.sql` only to the local synthetic directory.

Run `npm run test:e2e:p04f05` with Google Chrome installed. Screenshots, JSON results and logs are in `docs/healthcare/`. Failure traces are retained in ignored `test-results/`. Do not publish session databases or traces. The test signs out between nurse, doctor and billing officer.

`npm test` includes the fixed-date Phase 04 fixture clock; production still rejects past appointments. On Windows, deployment-denial checks use Git Bash rather than the WSL alias.

For a 42-to-43 migration failure, retain the synthetic database and failure log, restore structural prerequisites from a verified backup, and reopen. The migration is transactional; a failed upgrade must not retain marker 43. Destructive billing rollback is restricted to disposable synthetic databases and intentionally removes fictional charges while preserving patients and encounters.
