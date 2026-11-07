# P04-F03 runbook

Experimental local procedures. These do not authorize production repair of a real chart.

## Incorrect observation

Open the observation and use Correct. The new version stores the corrected quantity. The earlier snapshot remains in `source_versions`. A second save with the old version is rejected.

## Wrong patient

Do not edit `patient_id` in place. Mark the entry entered-in-error through the amendment path and record a new entry on the correct encounter. A merged patient id on an old row is left as recorded.

## Missing author

`source_versions.actor_id` is the session user. If it is missing, stop and restore from the last intact backup. Do not invent an author.

## Failed amendment

If the page shows the stale-version message, reload the entry and submit again with the current version. The failed attempt does not add a version when the transaction rolls back.

## Concurrent modification

Two corrections of version 1 produce one version 2. The other caller receives a conflict. Confirm `COUNT(*)` of `source_versions` for that record is 2.

## Closed encounter

Ordinary recording returns the closed-encounter error. An authorized amendment can still add a version. Do not reopen the encounter to edit.

## Terminology failure

An unknown code or unit is rejected before insert. Add a catalog code only through a reviewed change. Do not store a free-text code.

## Database outage

`source_controls.dependency = unavailable` rejects new writes and leaves no partial row. Set it back to `available` only after the database answers.

## Audit chain

Run the ledger verification for the organization. A broken chain stops further source acceptance. Do not delete ledger rows.

## Signing attempt

`clinical.sign` stays unimplemented. A draft that remains `executable = 0` and `transmission = disabled` was not issued. Do not add a pharmacy route.

## Failed migration

Schema 40 is additive. `SOURCE_ROLLBACK` drops the source tables, removes version 40, and records version 39. Opening the database applies schema 40 again. Re-seed the retention policy with `seedClinicalSource` in a local test database. Do not run this against a database you need to keep.

## Restart

Close and reopen the chart database. Source rows and versions remain. No replay of a committed command is required.
