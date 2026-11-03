# Appointments and encounters

Local experimental behavior for P04-F02. This is not a production scheduling policy and not a FHIR conformance claim.

## Records

An appointment belongs to the session organization and facility. It references one active patient registration and one active affiliated practitioner. Categories are `follow-up` (20 minutes) and `new-visit` (30 minutes). The visit reason stored for a new row is that category code. Free-text clinical narratives are not collected.

Scheduling resources are facility consultation rooms with stored capacity. Practitioner availability is weekday windows, seeded 08:00–12:00 local time on Monday through Friday. Past booking is rejected. A second submission with the same idempotency key returns the first appointment.

## Appointment transitions

| From | Allowed |
| --- | --- |
| requested | confirmed, cancelled |
| confirmed | arrived, cancelled, no-show |
| arrived | in-progress |
| in-progress | closed |
| closed, cancelled, no-show | none |

Every change stores actor, time, previous status, new status, reason, and version. A stale version returns a conflict. Two staff cannot both commit a status change from the same version.

## Encounter transitions

| From | Allowed |
| --- | --- |
| none | in-progress, by an authorized start |
| in-progress | completed |
| completed | none |

The responsible practitioner is the appointment practitioner. The starting user needs `encounter.start` at the facility. The practitioner must still be affiliated. A second start with the same command key returns the same encounter. A different key conflicts. Closing needs `encounter.close` and reason `visit-complete`, and it moves the appointment to closed.

Walk-in creation without an appointment is a later capability. It is not available.

## Concurrency

Requests, reschedules, arrivals, cancellations, and encounter starts run in `BEGIN IMMEDIATE`. Overlapping held or active reservations for the same practitioner, or for a resource at its capacity, conflict. The old reservation is updated in the same transaction as a reschedule. Cross-process races use separate Node processes against one SQLite file.

## Authorization

Receptionists can schedule, confirm, reschedule, cancel, arrive, and record a no-show. They cannot start or close an encounter. Nurses at Accra can do the same scheduling actions and can read an encounter without its history. Doctors can read appointments and can start, close, and read encounter history for the active facility. Organization administrators do not receive encounter access. Auditors do not receive appointment mutation or encounter history. A revoked membership cannot schedule.

## API

Pages call the chart directly. Writes use:

- `POST /api/appointments`
- `POST /api/appointments/{id}` for confirm, arrive, cancel, no-show, and start
- `POST /api/appointments/{id}/reschedule`
- `POST /api/encounters/{id}/close`

Conflicts redirect with `error=slot`, `error=stale`, or `error=conflict`. A slot conflict can offer the next open time for the same practitioner.

## Screens

`/appointments` lists facility appointments and counts. `/appointments/calendar` has day and week views. `/appointments/new` books from open slots. `/appointments/{id}` shows status, arrival, the linked encounter, and event history. `/appointments/check-in` records arrival only. `/encounters/{id}` and `/encounters/{id}/close` cover the visit lifecycle and do not collect clinical entries.

## FHIR note

The appointment and encounter fields can later be mapped toward FHIR R4 Appointment and Encounter. This build does not implement those resources or claim conformance.

## Synthetic scenario

Kofi Mensah's authoritative record is `pat_gh_kofi_a` at Accra Central. A merged patient identifier is rejected and is not rewritten. The seeded practitioner is `pr_gh_kwame`. Harborlight and Northwind patients stay on their existing rows.
