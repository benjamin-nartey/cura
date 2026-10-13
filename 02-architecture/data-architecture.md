# Data Architecture

## Data classes
- Source clinical data: authoritative records.
- Derived clinical state: deterministic materializations such as Patient Twin.
- AI-generated content: drafts, summaries, explanations and recommendations.
- Clinician-approved content: AI-assisted content accepted by a clinician, with provenance.
- Operational data: queues, inventory, staffing, facilities.
- Analytical/secondary-use data: governed replicas and de-identified datasets.

## Required metadata
Every clinical or AI-derived object must carry tenant, facility (where relevant), subject, provenance, effective time, recorded time, version, author/actor, confidentiality/security labels and retention class.

## Data movement
Transactional DB -> outbox/CDC -> Kafka -> consumers -> search/lakehouse/materialized twins. Do not dual-write transaction and event stores without an outbox or equivalent atomic pattern.

## Lakehouse
Object storage + Apache Iceberg; query via Trino/Spark. De-identification and data-use policy gates occur before secondary-use datasets are made available.
