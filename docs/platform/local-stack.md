# Local stack

Start the Compose project `curasphere-local`:

```bash
bash infra/local/up.sh
```

That command waits until Postgres, Redis, Kafka, Temporal, object storage, Dex, and the OpenTelemetry collector are ready, then runs the smoke check. The published ports are loopback-only: Postgres `54329`, Redis `63790`, Kafka `19092`, Temporal `17233`, object storage `19000`, Dex `15556`, collector health `13133`. The test credential is `local-test-only`.

This project does not use port `5432`. The foundation service keeps its existing database.

Reset only this project:

```bash
bash infra/local/reset.sh
```

If Kafka is stopped, `bash infra/local/smoke.sh` exits 1 and prints `stack smoke failed: kafka`. Start Kafka again with `docker compose -f infra/local/compose.yaml start kafka` and rerun the smoke check.
