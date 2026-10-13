# ADR-0045: A dispense is stored against the foundation order

Status: Accepted
Date: 2026-10-12

## Context
ADR-0044 marked a recorded prescription active in PostgreSQL. A dispense still wrote only in SQLite, so the foundation order stayed `active` after medication had left the clinic.

## Decision
`POST /sessions/{id}/patients/{patientId}/prescriptions/{orderId}/dispenses` stores a dispense for a clinician, a nurse, or an admin. The order must already be `active` or `dispensed` on the session facility. The quantity is a whole number from 1 to 90. The foundation order becomes `dispensed`. The same dispense id is then stored in SQLite. If the foundation service is down, or the order is not in it, the clinic dispense is left unchanged. The outbox carries the ids. It does not copy the quantity, the dose, or the drug name. Kafka and Temporal are not started. Nothing was billed. Acknowledgement of a warning still exists only in SQLite. The dispense does not diagnose.

## Consequences
A new dispense is stored in both databases after the foundation service is restarted with this change. An order that exists only in SQLite cannot be dispensed until it is in the foundation service and recorded there. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record an administration against that order in the foundation database. Acknowledgement of a warning still exists only in SQLite.
