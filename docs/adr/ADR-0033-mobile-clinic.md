# ADR-0033: The mobile clinic reads the foundation service

Status: Accepted
Date: 2026-10-08

## Context
The web chart can run a synthetic clinic day. A phone had no client. A lab result still wrote its observation only in SQLite, so the latest-results list could miss it.

## Decision
The lab result route records the observation in the foundation service, stores that same id in SQLite, and then stores the lab row against it. The mobile app in `apps/mobile` calls the foundation service for the directory, today's appointments, the patient list, the chart core, the facility catalog, and a new result. It does not diagnose, recommend treatment, or call a model. Kafka and Temporal are not started.

## Consequences
A phone must be able to reach the foundation port. The web app remains http://localhost:3000. Rollback for the mobile client is to stop that process. Do not delete the SQLite file for this change.

## Revisit trigger
Move the timeline read onto PostgreSQL. Until then, the phone does not show the timeline.
