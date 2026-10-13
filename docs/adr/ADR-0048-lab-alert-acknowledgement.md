# ADR-0048: Acknowledgement of a lab alert is stored in PostgreSQL

Status: Accepted
Date: 2026-10-13

## Context
ADR-0042 stored a lab result in PostgreSQL, including the critical flag. The alert for that flag, and its acknowledgement, still lived only in SQLite.

## Decision
A critical result stores an open alert in the foundation service, and that same alert id is copied to SQLite. `POST /sessions/{id}/patients/{patientId}/lab-orders/{orderId}/alert/acknowledge` marks that alert acknowledged for a clinician, a nurse, or an admin. A result with no critical flag has no alert. The server does not change the critical flag on the result. The browser cannot clear it. The same acknowledgement is then stored in SQLite. If the foundation service is down, or the alert is not in it, the clinic alert is left unchanged. The outbox carries the ids and the critical flag. It does not copy the numeric value or the test name. Kafka and Temporal are not started. A model cannot clear the flag. The acknowledgement does not diagnose.

## Consequences
A new critical result and its acknowledgement are stored in both databases after the foundation service is restarted with this change. An alert that exists only in SQLite cannot be acknowledged until the result is in the foundation service. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record a care preference in the foundation database.
