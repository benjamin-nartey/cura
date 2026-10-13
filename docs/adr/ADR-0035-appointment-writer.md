# ADR-0035: A booked visit is stored in PostgreSQL

Status: Accepted
Date: 2026-10-12

## Context
ADR-0034 reads appointments from the foundation database. Accepting a patient visit request wrote the appointment only in SQLite, so that visit stayed off the foundation timeline and the phone board.

## Decision
`POST /sessions/{id}/appointments` books a visit for a patient on the session facility. The caller is a clinician or an admin. A nurse is refused. Another facility receives not-found. The end must be after the start, and both times are UTC instants. The status is `booked`. The same idempotency key returns the same appointment. A different body on that key is a conflict. The outbox event carries the patient id and the appointment id. It does not copy the reason. The chart decision route books in the foundation service first and stores that same id in SQLite. A decline does not create an appointment. If the foundation service is down, the accept is refused and SQLite is left unchanged. The phone can book the same way. Kafka and Temporal are not started. Nothing is billed.

## Consequences
A visit accepted on the chart, or booked on the phone, appears on the day board and the timeline after the foundation service is restarted with this change. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record later chart writers that still exist only in SQLite, including a new problem, allergy, or medication, into the foundation database.
