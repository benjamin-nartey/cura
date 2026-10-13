# Reliability and Multi-Region Architecture

## Service objectives
Define SLI/SLOs by user journey, not just service uptime. Example journeys: patient registration, open chart, sign note, result delivery, medication order, billing, FHIR read/write and AI summary.

## Architecture rules
- Stateless services horizontally scalable.
- Database HA within region; tested PITR.
- Kafka replication strategy appropriate to deployment.
- Object storage versioning/replication for required classes.
- Regional isolation and data residency.
- Idempotent handlers and durable workflows.
- Circuit breakers, deadlines, retries with jitter and bulkheads.

## Release
Shadow -> internal -> pilot tenants -> 1%/5%/25%/50%/100%, with automatic abort on safety/SLO thresholds.
