#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
if [[ -f "$root/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$root/.env"
  set +a
fi
if ! command -v java >/dev/null 2>&1; then
  adoptium="$(ls -d "/c/Program Files/Eclipse Adoptium"/jdk-21* 2>/dev/null | head -n 1 || true)"
  if [[ -n "$adoptium" ]]; then
    export JAVA_HOME="$adoptium"
    export PATH="$JAVA_HOME/bin:$PATH"
  fi
fi
cd "$root"
exec "$root/gradlew" "$@"
