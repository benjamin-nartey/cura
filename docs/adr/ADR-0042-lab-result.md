# ADR-0042: A lab result row is stored in PostgreSQL

Status: Accepted
Date: 2026-10-12

## Context
ADR-0041 stored the specimen in PostgreSQL. Recording a result still wrote the result row only in SQLite. The foundation order stayed `collected`, and the critical flag lived only on the clinic record.

## Decision
`POST /sessions/{id}/patients/{patientId}/lab-orders/{orderId}/result` stores the result for a clinician, a nurse, or an admin. The order must be on the session facility, collected, and tied to the observation just recorded. The server copies the reference range from the facility catalog and sets the critical flag from rule `lab-critical-2026.10`. The browser cannot set that flag. The foundation order becomes `resulted`. The same result id is then stored in SQLite. If the foundation service is down, or the order is not in it, the clinic result is left unchanged. The outbox carries the ids, the critical flag, and the rule version. It does not copy the numeric value or the test name. Kafka and Temporal are not started. The result does not diagnose.

## Consequences
A new result is stored in both databases after the foundation service is restarted with this change. An order that exists only in SQLite cannot be resulted until it is in the foundation service. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record the next chart writer that still exists only in SQLite.
