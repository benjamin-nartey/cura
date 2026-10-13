# ADR-0036: A new problem, allergy, or medication is stored in PostgreSQL

Status: Accepted
Date: 2026-10-12

## Context
ADR-0035 left problems, allergies, and medications readable from the foundation database, but a new row was still written only in SQLite. The timeline and the phone then missed it.

## Decision
`GET /sessions/{id}/condition-catalog` returns the pinned ICD-10-CM 2026 problems already used on the chart. `POST /sessions/{id}/patients/{patientId}/conditions` stores one of those codes. The display is copied from the pin. A code outside the pin is refused. `POST .../allergies` stores the substance, reaction, and criticality the clinician or nurse entered. Criticality is `low` or `high`. A long digit run is refused. `POST .../medications` stores a medication for a clinician or an admin. A nurse is refused. The chart records a medication only after the existing prescription check says the order can be activated, then stores that same id in SQLite. Problems and allergies are copied the same way. If the foundation service is down, the clinic record is left unchanged. The outbox carries ids and, for a problem, the code. It does not copy the display, the reaction, or the dose. Status stays `active`. Kafka and Temporal are not started. Nothing is billed, and these rows do not diagnose.

## Consequences
A problem, allergy, or recorded prescription appears on the foundation timeline after the foundation service is restarted with this change. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record the next chart writer that still exists only in SQLite.
