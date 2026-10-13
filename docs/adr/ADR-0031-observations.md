# ADR-0031: Chart results are read from PostgreSQL

Status: Accepted
Date: 2026-10-08

## Context
ADR-0030 kept observations in SQLite. The chart list, the timeline, the patient state, and a lab result all read that table. Moving every remaining chart table at once would break those joins. An observation table that the chart does not read would break the rule this slice has followed.

## Decision
Recording a result from the chart is written in the foundation service. The facility and the catalog pin come from the session, not from the browser. A code outside that facility catalog is refused. A value outside the pin's entry range is refused. The threshold text is copied from the pin. The audit row and the `observation.recorded` outbox row commit with the result, and the outbox does not copy the numeric value. The same id is stored in SQLite so the timeline and the patient state still join. The latest-results list reads PostgreSQL. A lab result and a FHIR create still append the SQLite observation. Appointments and the problem list stay on the SQLite chart record. Kafka and Temporal are not started.

## Consequences
Foundation schema version is 4. The seven synthetic results and the facility pins are seeded. Lakeside Hospital still has no cardiac-marker pin. Rollback for this change is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Move conditions onto PostgreSQL. Until then, the problem list stays in SQLite, and a new lab result is not in the foundation list.
