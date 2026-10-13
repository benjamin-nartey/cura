# ADR-0037: A FHIR observation is stored in PostgreSQL

Status: Accepted
Date: 2026-10-12

## Context
ADR-0031 recorded a chart result in the foundation service. Creating an Observation through FHIR still wrote that row only in SQLite, so the timeline and the phone missed it.

## Decision
`POST /api/fhir/r4/Observation` checks the FHIR body on the server, then records the observation in the foundation service, then stores that same id in SQLite. The facility catalog still supplies the display, the unit, and the threshold. The browser does not assign the id, the time, or the flag. If the foundation service is down, nothing is stored. The same idempotency key is used for both writes. Domain tests can still store an observation without calling the foundation service. Kafka and Temporal are not started. The row does not diagnose.

## Consequences
A FHIR observation appears on the foundation timeline after the foundation service is restarted with the observation route already in place. This change is in the web app. Rollback is to stop the web app. Do not delete the SQLite file for this change.

## Revisit trigger
Record a device reading in the foundation database so that measurement appears on the timeline.
