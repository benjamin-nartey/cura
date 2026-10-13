# ADR-0016: Analytics mart is a governed copy of the outbox

Status: Accepted
Date: 2026-10-08

## Context
Phase 20 asks for CDC, an Iceberg lakehouse, a semantic metrics layer, de-identification, and tenant marts. This workspace has an outbox written in the same transaction as each change. It does not have Kafka or an Iceberg catalog. A fake lakehouse, or a query that reads the chart under another name, would be a production mock.

## Decision
An auditor ingests outbox rows for the session organization into `analytics_facts`. The copy keeps a facility id when the payload has one, and drops every other field. The dropped key names are stored. The values are not. Metrics are the pinned set `events-by-type` and `events-by-facility` in `analytics-metrics-2026.10`. A client cannot pass SQL. Export releases a cell only when its count is at least 5 (`analytics-reid-2026.10`). The released body is counts. Lineage from the cell to fact ids and outbox ids is stored on the export. Before release, the body is scanned for a patient name, MRN, or birth date in that organization. A match withholds the body. Clinicians, nurses, and administrators cannot read the mart. `analytics-governance-2026.10` requires role auditor and purpose AUDIT.

## Consequences
Schema version 16 adds the analytics tables. Iceberg and Kafka remain the production target and are not stubbed. Rollback is to stop the app and delete `data/curasphere.sqlite`.

## Revisit trigger
A reviewed CDC publisher and Iceberg catalog are connected. The mart still has to drop direct identifiers, and a query still has to pass the same governance check.
