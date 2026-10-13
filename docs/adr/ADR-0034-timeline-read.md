# ADR-0034: The timeline is read from PostgreSQL

Status: Accepted
Date: 2026-10-12

## Context
ADR-0033 left the timeline projection on SQLite. The chart pane and `GET /api/patients/{id}/timeline` both read that projection. The phone calls the foundation service and had no timeline.

## Decision
`GET /sessions/{id}/patients/{patientId}/timeline?group=` reads encounters, problems, allergies, medications, observations, and appointments from the foundation database and projects one event per source row. The facility comes from the session. An unknown group is refused. Another facility receives not-found. The chart pane and the phone use this projection when the foundation service answers. The SQLite projection remains for the domain tests and for a chart opened while the foundation service is down. The projection is not saved. It does not diagnose or recommend treatment. Kafka and Temporal are not started.

## Consequences
A new source row appears on the phone timeline only after it is stored in the foundation database. Rollback is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Record later chart writers, including a new appointment, into the foundation database. Until then, a row that exists only in SQLite stays off this timeline.
