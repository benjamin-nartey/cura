#!/usr/bin/env bash
set -euo pipefail
env_name="${1:-dev}"
if [[ "$env_name" == "production" ]]; then
  echo "production rollback is not authorized" >&2
  exit 2
fi
: "${HELM:?HELM is required}"
: "${KUBECTL:?KUBECTL is required}"
namespace="curasphere-${env_name}"
"$HELM" rollback curasphere --namespace "$namespace"
"$KUBECTL" rollout status "deployment/ai-gateway" -n "$namespace" --timeout=180s
echo "rolled back ${env_name}"
