# ADR-0046: An administration is stored against the foundation order

Status: Accepted
Date: 2026-10-12

## Context
ADR-0045 stored a dispense in PostgreSQL. An administration still wrote only in SQLite, so the foundation order had no record that a dose was given.

## Decision
`POST /sessions/{id}/patients/{patientId}/prescriptions/{orderId}/administrations` stores an administration for a clinician, a nurse, or an admin. The order must already be `active` or `dispensed` on the session facility. The foundation order status stays as it is. The same administration id is then stored in SQLite. If the foundation service is down, or the order is not in it, the clinic administration is left unchanged. The outbox carries the ids. It does not copy the dose or the drug name. Kafka and Temporal are not started. Nothing was billed. Acknowledgement of a warning still exists only in SQLite. The administration does not diagnose.

## Consequences
A new administration is stored in both databases after the foundation service is restarted with this change. An order that exists only in SQLite cannot receive an administration until it is in the foundation service and recorded there. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record acknowledgement of a warning in the foundation database.
