#!/usr/bin/env bash
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
cd "$dir"
docker compose up -d --wait
bash "$dir/smoke.sh"
