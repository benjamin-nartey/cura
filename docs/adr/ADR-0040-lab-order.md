# ADR-0040: A lab order is stored in PostgreSQL

Status: Accepted
Date: 2026-10-12

## Context
ADR-0039 left a new lab order in SQLite. The chart could place an order only in the clinic database, so that order was not in the foundation service.

## Decision
`POST /sessions/{id}/patients/{patientId}/lab-orders` stores an order for a clinician or an admin. A nurse is refused. The code must be on the facility catalog. The display is copied from that pin. Status stays `requested`. The same id is then stored in SQLite. If the foundation service is down, the clinic record is left unchanged. The outbox carries the patient id, the order id, and the code. It does not copy the display. Specimen collection and the result row stay in SQLite. Kafka and Temporal are not started. The order does not diagnose.

## Consequences
A new lab order is stored in both databases after the foundation service is restarted with this change. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record specimen collection against that order in the foundation database.
