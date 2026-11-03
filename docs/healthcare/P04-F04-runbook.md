# P04-F04 runbook

Experimental operations only. Do not use these steps on production or real patient data.

## Duplicate department request

Compare `work_commands` for the submission key. One `work_orders` row and one version 1 row is the expected result. Do not delete the row to “clean up” a repeated click.

## Request sent to the wrong department

Cancel it with a reason while the origin facility still has `work.order.cancel`. The cancellation keeps the submitted version. Create a new request for the correct department. Do not edit the old version in place.

## Pending work missing

Confirm the session facility. Origin staff see requests they created. Destination staff see requests whose department belongs to their facility. A third facility does not see either queue.

## Stale assignment

The assignee loaded an old task version. Reload the task and assign again. The stored version must not skip.

## Closed encounter

A new request is rejected. Cancellation of an existing request remains available to the origin facility. Do not reopen the encounter to edit the request.

## Transmission attempt

`transmitWorkOrder` is denied. `fulfillment` stays `not-transmitted`. No laboratory or pharmacy message is created.

## Database outage

`work_controls.dependency = unavailable` rejects new work before a row is written. Restore `available` only after the database accepts writes. A failed version insert rolls the order and task back together.

## Migration rollback

`WORK_ROLLBACK` drops the schema 41 tables and returns the migration head to 40. Opening the database again applies schema 41. It does not drop clinical source tables from schema 40.

## Audit chain

Sensitive reads and mutations append the access ledger with record ids only. Department displays and attachment checksums do not belong in metric names.
