# ADR-0047: Acknowledgement of a warning is stored in PostgreSQL

Status: Accepted
Date: 2026-10-13

## Context
ADR-0046 stored an administration in PostgreSQL. Acknowledging a prescription warning still wrote only in SQLite, so the foundation warning stayed `open` after a person had acknowledged it on the clinic chart.

## Decision
`POST /sessions/{id}/patients/{patientId}/prescriptions/{orderId}/warnings/{warningId}/acknowledge` stores the acknowledgement for a clinician, a nurse, or an admin. The warning must be `open` on that order and on the session facility. The server keeps the stored severity. The browser cannot change it. The same warning is then marked acknowledged in SQLite. If the foundation service is down, or the warning is not in it, the clinic warning is left unchanged. The outbox carries the ids and the severity. It does not copy the warning text, the dose, or the drug name. Kafka and Temporal are not started. A model cannot clear the warning. The acknowledgement does not diagnose.

## Consequences
A new acknowledgement is stored in both databases after the foundation service is restarted with this change. A warning that exists only in SQLite cannot be acknowledged until that order is in the foundation service. The order status stays as it is. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record acknowledgement of a lab alert in the foundation database. The critical flag stays on the result.
