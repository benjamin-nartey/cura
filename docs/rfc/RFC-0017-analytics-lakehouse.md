# RFC: Analytics and lakehouse

Status: Accepted
Owners: Foundation implementation
Reviewers: Engineering, clinical safety (local slice only)

## Problem
Secondary use needs counts from operational events without opening the chart and without a second copy of names, birth dates, or result values.

## Goals / non-goals
Goals: ingest the outbox into a tenant mart, drop direct identifiers, expose two pinned metrics, suppress cells below 5, record lineage back to the outbox, and scan an export for a patient identifier before release.

Non-goals: Kafka, Iceberg, a SQL console, a patient list, a model-written narrative, and a forecast.

## Data flow

```
outbox row, same organization
    |
    v
de-identification pin analytics-deid-2026.10
    |  keep facilityId when it matches a facility id
    |  drop every other key, store the key name only
    v
analytics_facts, one row per outbox id
    |
    v
pinned metric
    |
    +-- cell count below 5 => suppressed
    +-- cell count 5 or more => candidate
          scan for name, MRN, or birth date
          match => withhold
          otherwise release counts
          lineage stores fact ids and outbox ids
```

Organization comes from the session. The mart does not update the chart.

## Proposed design
`POST /api/analytics/ingest` and `POST /api/analytics/export`. Outbox events `analytics.ingest` and `analytics.export` carry a count or an export id, not a payload value. Audit actions use the `analytics.*` names. Governance `analytics-governance-2026.10` allows only an auditor.

## Security and privacy
Another organization's outbox is not copied. A clinician cannot open the mart. The released body has no patient id. Lineage stays on the export row.

## Threat model

| Threat | Mitigation | Test |
| --- | --- | --- |
| A clinician reads the mart | Role and purpose are checked before any fact query | Amira is forbidden |
| A name or result is copied | Only a facility id is kept. Other keys are dropped | The fact text has no Elena, no patient id, and no code |
| Another tenant's event is ingested | The outbox query filters the session organization | A Lakeside observation is not in Harborlight facts |
| A small cell identifies a person | Counts below 5 are suppressed | The ingest event itself stays suppressed |
| A released count contains an identifier | The body is scanned against patient name, MRN, and birth date | Elena matches the scanner. The count body does not |
| A client sends SQL | The metric id must be one of the two pinned ids | An arbitrary string is refused |

## Observability
`GET /api/health` reports schema version 16. Audit rows record analytics reads, ingests, and exports.

## Rollback
Stop the app. Delete `data/curasphere.sqlite` and its wal, shm, and journal files. The next start reseeds schema 16. That deletes local writes.
