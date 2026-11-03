# P04-F01 local runbook

This runbook is for the local experimental environment. It does not enable staging or production clinical processing.

## Sandbox

Required environment for the local experiment:

- `CURASPHERE_LOCAL_PHASE_OVERRIDE=true`
- `CURASPHERE_ENV=local`
- `CURASPHERE_DEV_DIRECTORY=local-test`
- `CURASPHERE_DATA_CLASS=synthetic`

Unset the override and the governance runner returns to ordinary enforcement. Staging, production, a production database URL, and a non-synthetic data class refuse the override.

## Recreate chart fixtures

From `packages/domain`, an empty SQLite file becomes schema 38 when `createDatabase` runs. `seed` then `seedDemoTenants` inserts Harborlight, Northwind, DEMO_GH, and DEMO_EU organizations, the chart workforce personas, the representative patients, and the P04-F01 fixture patients and practitioners.

The chart database used by the web app is `data/curasphere.sqlite`. Opening it applies the additive schema 38 migration. Existing Harborlight and Northwind rows are kept. New columns default to an active chart registration.

## Recreate local directory personas

The chart seed already inserts the synthetic workforce personas. The foundation database on `127.0.0.1:5432` can receive the same local-only personas with:

```bash
CURASPHERE_LOCAL_PHASE_OVERRIDE=true CURASPHERE_ENV=local CURASPHERE_DEV_DIRECTORY=local-test CURASPHERE_DATA_CLASS=synthetic node tools/fixtures/seed-local-directory.mjs
```

The script exits 1 when those flags are missing, when the environment is production or staging, or when the database host is not loopback. It does not set a password. Inserts are idempotent.

## Checks

```bash
node --import tsx --import ./packages/domain/test/dev-env.ts --test --test-concurrency=1 packages/domain/test/master-records.test.ts
npm test --workspace @curasphere/domain
npm run typecheck --workspace @curasphere/domain
npm run typecheck --workspace @curasphere/web
npm run build --workspace @curasphere/web
npm run governance:test
```

Run the governance runner only with the sandbox variables above and with production, publish, deploy, and external-healthcare variables empty.

## Rollback

`MASTER_ROLLBACK` in `packages/domain/src/master-records.ts` drops the schema 38 tables and records version 37. Patient rows remain. Opening the database applies schema 38 again, including identifier and facility backfill. Do not delete the chart file to roll back; that would also remove accepted Phase 03 evidence.

## Staff routes

- `/patients` searches the chart master for the session facility.
- `/patients/review` shows duplicate candidates before a new registration is saved.
- `/patients/{id}/identity` shows demographics, identifiers, facilities, versions, and privacy-link state.
- `/patients/duplicates` and `/patients/duplicates/{id}` review candidates. Merge posts to `/api/patients/duplicates/{id}` and requires confirmation plus `patient.merge`.
- `/practitioners` and `/practitioners/{id}` create, affiliate, and link practitioners.

Authentication stays on the directory session. Authorization is the chart role grant. A practitioner link does not add permissions.
