#!/usr/bin/env bash
set -euo pipefail
env_name="${1:-}"
root="$(cd "$(dirname "$0")/../.." && pwd)"
if [[ "$env_name" != "dev" && "$env_name" != "staging" ]]; then
  echo "production deployment is not authorized" >&2
  exit 2
fi
: "${HELM:?HELM is required}"
: "${KUBECONFIG:?KUBECONFIG is required}"
: "${KUBECTL:?KUBECTL is required}"
: "${CURASPHERE_TOKEN_FILE:?CURASPHERE_TOKEN_FILE is required}"
token="$(tr -d '\r\n' < "$CURASPHERE_TOKEN_FILE")"
if [[ -z "$token" ]]; then
  echo "token file is empty" >&2
  exit 2
fi
namespace="curasphere-${env_name}"
"$HELM" upgrade --install curasphere "$root/infra/helm/curasphere" \
  --namespace "$namespace" \
  --create-namespace \
  -f "$root/infra/helm/curasphere/values-${env_name}.yaml" >/tmp/curasphere-helm-upgrade.txt
if grep -q "$token" /tmp/curasphere-helm-upgrade.txt; then
  echo "helm output contained the token" >&2
  exit 1
fi
"$KUBECTL" -n "$namespace" create secret generic "curasphere-${env_name}-token" \
  --from-literal="token=${token}" \
  --dry-run=client -o yaml | "$KUBECTL" apply -f - >/dev/null
"$KUBECTL" -n "$namespace" delete pod -l app=ai-gateway --ignore-not-found >/dev/null
echo "deployed ${env_name}"
