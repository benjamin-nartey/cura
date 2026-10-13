# ADR-0044: Recording a prescription updates the foundation order

Status: Accepted
Date: 2026-10-12

## Context
ADR-0043 stored a proposed prescription in PostgreSQL. Recording it on the medication list wrote the medication in the foundation service and left the foundation order `proposed`. The clinic order became `active`. Acknowledgement of a warning still lived only in SQLite.

## Decision
`POST /sessions/{id}/patients/{patientId}/prescriptions/{orderId}/record` marks that foundation order `active` for a clinician or an admin. The order must still be `proposed` on the session facility. The medication must already be an active medication for that patient, with the same name and dose as the order. The same medication id is then stored on the clinic order. If the foundation service is down, or the order is not in it, the clinic order is left unchanged. Open warnings stay open. The outbox carries the ids and the formulary id. It does not copy the dose or the drug name. Kafka and Temporal are not started. The record does not diagnose. A model cannot clear a warning.

## Consequences
A prescription recorded from the chart is active in both databases after the foundation service is restarted with this change. An order that exists only in SQLite cannot be recorded until it is in the foundation service. A high-risk warning still has to be acknowledged on the clinic record before that button is shown. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record a dispense against that order in the foundation database. Acknowledgement of a warning still exists only in SQLite.
