#!/usr/bin/env bash
set -euo pipefail
dir="$(cd "$(dirname "$0")" && pwd)"
cd "$dir"
docker compose down -v
echo "local stack volumes removed"
