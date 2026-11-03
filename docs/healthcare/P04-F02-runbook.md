# P04-F02 scheduling runbook

These checks use the local synthetic chart. They do not recover a production clinic.

## Double-booking

Two processes reserving one practitioner slot leave one held reservation. The other response is a conflict. Confirm with `scheduling_reservations` where status is held or active. Do not raise room capacity from a request.

## Practitioner unavailable

An inactive practitioner or a missing facility affiliation is rejected before a reservation is inserted. Restore the affiliation only through the practitioner record, then book again.

## Calendar inconsistency

The calendar reads the same appointment and slot queries as booking. If a displayed time fails on save, the page returns to the booking form with the next open time for that practitioner. Reload the calendar after the save.

## Failed reschedule

The replacement and the original reservation change in one transaction. If the new time overlaps, the original start remains. Compare `appointments.starts_at` with `scheduling_reservations.starts_at`.

## Stale appointment

A confirm and a cancel submitted with the same version cannot both commit. Reload the appointment and use the stored version.

## Encounter for the wrong patient

The encounter copies the appointment patient id. It does not accept a different patient in the start request. If the appointment was booked against a superseded patient, booking is rejected before arrival.

## Orphaned encounter

A reservation insert failure aborts the appointment insert. An encounter is inserted only after the appointment transition in the same transaction. A trigger failure leaves neither row.

## Database outage

`scheduling_controls.dependency = unavailable` rejects new scheduling before a reservation is written. Set it back to `available` only after the file is reachable.

## Restart

Closing and reopening the SQLite file keeps appointment status, reservation status, and encounter status. Schema 39 is applied again if the migration row is missing.

## Invalid migration

`SCHEDULE_ROLLBACK` drops the scheduling tables, removes schema version 39, and records version 38. Opening the database applies schema 39 again. Appointment columns added to the legacy table remain. Re-seed availability after that rollback in a local test database.

## Audit write failure

Status changes call the existing ledger writer inside the scheduling transaction. A ledger rejection rolls the status change back. Verify the chain with the access-ledger check for the organization. Do not put names or contact values in the ledger.

## Rollback recovery

After `SCHEDULE_ROLLBACK` and a reopen, new bookings require `seedScheduling` or the next demo-tenant seed. Legacy Harborlight appointments remain `booked` and are not exclusive holds.
