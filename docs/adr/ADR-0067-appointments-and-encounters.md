# ADR-0067 — Appointments and encounter lifecycle

## Status

Experimental engineering record for local P04-F02. This ADR does not authorize Phase 04, production scheduling, or a clinical release.

## Decision

Scheduling extends the existing `appointments` table in chart schema 39. Legacy rows stay `source = legacy-chart` and `status = booked`. They are not exclusive reservations. New bookings use `source = schedule` and the lifecycle `requested`, `confirmed`, `arrived`, `in-progress`, `closed`, `cancelled`, `no-show`.

The existing chart `encounters` table remains the clinical source row used by observations. P04-F02 stores the administrative visit in `visit_encounters`. One appointment has at most one visit encounter. Walk-in encounters are not implemented.

## Capacity

Intervals are half-open: `[start, end)`. A practitioner has exclusive capacity 1. A facility consultation room has the capacity stored on `scheduling_resources`, seeded at 1. A client cannot raise that capacity. Overlap is counted inside `BEGIN IMMEDIATE` after `PRAGMA busy_timeout = 5000`. SQLite has no exclusion constraint, so the overlap query plus the immediate transaction is the lock. A failed reschedule rolls back and leaves the original reservation.

## State machines

Appointment transitions: requested to confirmed or cancelled; confirmed to arrived, cancelled, or no-show; arrived to in-progress; in-progress to closed. No-show requires an explicit action, a confirmed appointment, no recorded arrival, and a clock at or after the scheduled end. Cancellation releases a held or active reservation. An in-progress or closed appointment cannot be cancelled by the ordinary action.

Encounter transitions: created directly as in-progress, then completed. A completed encounter cannot be reopened. Starting the encounter is the only path into appointment `in-progress`. Confirmation does not start care, and the clock does not start care.

## Identity

An appointment references the existing patient and practitioner rows. A merged or inactive patient cannot be booked. Historical appointment patient identifiers are not rewritten by a later merge. The practitioner must have an active affiliation at the actor's facility. The actor's organization and facility come from the session. Practitioner-account linking does not grant `encounter.start` or `encounter.close`.

## Privacy

Booking is not a consent action. A reminder is queued only in the local sandbox when a verified consent subject link has an active communication directive. A withdrawn directive, including Akua Boateng's, stays withdrawn and no notice row is written. Retention category `appointment-encounter` is retain and pending policy approval. Disposal is not implemented. Audit metadata stores identifiers. Telemetry sanitization drops names, narratives, and contact values. Metrics use low-cardinality names only.
