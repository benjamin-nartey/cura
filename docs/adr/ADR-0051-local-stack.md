# ADR-0051: The local stack does not replace the running foundation database

Status: Accepted
Date: 2026-10-13

## Context
P01-F02 requires PostgreSQL, Redis, Kafka, Temporal, object storage, a development OIDC issuer, and an OpenTelemetry collector. The foundation service already uses PostgreSQL on 127.0.0.1:5432. Docker Desktop is installed. Its engine was not running when this decision was recorded.

## Decision
Run those services in the Compose project `curasphere-local`. Publish them on loopback ports that leave 5432, 3000, and 8081 free. The test credential is `local-test-only`. Object storage uses the anonymously pullable S3-compatible image `pgsty/silo` because `minio/minio` and `quay.io/minio/minio` refused anonymous pulls on 2026-10-13. The stack starts empty: the smoke check requires that a `patients` table is absent. Reset is `bash infra/local/reset.sh`, which removes only this project's volumes.

## Consequences
`bash infra/local/up.sh` is the one start command. It is not accepted until the smoke check passes against a running engine. Rollback is `bash infra/local/reset.sh` and removal of `infra/local`. No foundation migration is involved.

## Revisit trigger
Point the foundation service at port 54329 only after a separate decision. Do not do that while a developer database is already on 5432.
