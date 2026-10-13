# ADR-0032: Problems, allergies, medications, and appointments are read from PostgreSQL

Status: Accepted
Date: 2026-10-08

## Context
ADR-0031 left the problem list, allergies, medications, and appointments in SQLite. The chart and the worklist both read those tables. Moving the later modules in the same change would break the chart. A core table that the chart does not read would break the rule this slice has followed.

## Decision
The chart reads problems, allergies, and medications from the foundation service. The worklist reads today's appointments from the same service. The facility comes from the workforce session. The same rows are stored in SQLite so the timeline and the patient state still join. A synthetic clinic day is seeded beside the original five patients: six more at Riverside, two at East Annex, and two at Lakeside. Each added record has a problem, a medication, a result inside that facility catalog, and an appointment on 2026-10-08. Lakeside still has no cardiac-marker pin. These rows are authored source records, not model output. Kafka and Temporal are not started.

## Consequences
Foundation schema version is 5. Rollback for this change is to stop the foundation service. Do not delete the SQLite file for this change.

## Revisit trigger
Move the lab result writer onto the foundation observation record. Until then, a new lab result stays on the SQLite observation.
