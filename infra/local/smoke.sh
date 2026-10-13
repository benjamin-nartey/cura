#!/usr/bin/env bash
set -euo pipefail
export MSYS_NO_PATHCONV=1
dir="$(cd "$(dirname "$0")" && pwd)"
cd "$dir"

fail() {
  echo "stack smoke failed: $1" >&2
  exit 1
}

wait_http() {
  local url="$1"
  local name="$2"
  local attempt
  for attempt in 1 2 3 4 5 6 7 8 9 10 11 12; do
    if curl --fail --silent "$url" >/dev/null; then
      return 0
    fi
    sleep 5
  done
  fail "$name"
}

docker compose exec -T postgres pg_isready -U curasphere -d curasphere >/dev/null || fail "postgres"
count="$(docker compose exec -T postgres psql -U curasphere -d curasphere -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'patients'")"
[[ "$count" == "0" ]] || fail "postgres is not an empty chart database"

docker compose exec -T redis redis-cli -a local-test-only ping | grep -q PONG || fail "redis"
docker compose exec -T kafka sh -c '/opt/kafka/bin/kafka-broker-api-versions.sh --bootstrap-server kafka:19092' >/dev/null || fail "kafka"
docker compose exec -T temporal sh -c 'temporal operator cluster health --address $(hostname -i):7233' >/dev/null || fail "temporal"
wait_http http://127.0.0.1:19000/minio/health/live minio
wait_http http://127.0.0.1:15556/dex/.well-known/openid-configuration dex
wait_http http://127.0.0.1:13133/ otel
echo "local stack smoke passed"
