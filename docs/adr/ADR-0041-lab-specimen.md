# ADR-0041: A specimen is stored against the foundation lab order

Status: Accepted
Date: 2026-10-12

## Context
ADR-0040 stored a lab order in PostgreSQL and left specimen collection in SQLite. The order status in the foundation service stayed `requested` after a specimen was recorded on the clinic chart.

## Decision
`POST /sessions/{id}/patients/{patientId}/lab-orders/{orderId}/specimen` records a specimen for a clinician, a nurse, or an admin. The order must already be on the session facility and still be `requested`. The foundation order becomes `collected`. The same specimen id is then stored in SQLite, and that order becomes `collected` there too. If the foundation service is down, or the order is not in it, the clinic record is left unchanged. The outbox carries the patient id, the order id, and the specimen id. It does not copy the test name. The result row stays in SQLite. Kafka and Temporal are not started. The specimen does not diagnose.

## Consequences
A specimen is stored in both databases after the foundation service is restarted with this change. An order that exists only in SQLite cannot be collected until it is in the foundation service. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record the lab result row against that specimen in the foundation database.
