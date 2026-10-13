# ADR-0030: Open encounters are read from PostgreSQL

Status: Accepted
Date: 2026-10-08

## Context
ADR-0029 kept encounters in SQLite. The worklist and the chart both read that table. Observations still point at the SQLite encounter. Moving every chart table at once would break those joins. An encounter table that nothing reads would break the rule this slice has followed.

## Decision
Opening and finishing an encounter is written in the foundation service. The facility comes from the workforce session. A second open encounter for the same patient is refused. A finish with the wrong version is refused. The audit row and the outbox row commit with the encounter. The same id is stored in SQLite so the chart and its observations still join. The worklist reads open encounters from PostgreSQL. Appointments stay on the SQLite chart record. Kafka and Temporal are not started.

## Consequences
Foundation schema version is 3. The three synthetic encounters are seeded. Rollback for this change is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Move observations onto PostgreSQL. Until then, the SQLite encounter remains the parent those rows join.
