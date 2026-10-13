#!/usr/bin/env bash
# Disposable local delivery checks. Does not apply paid cloud resources.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
bin="$root/tools/bin"
mkdir -p "$bin"
cd "$root"

download() {
  local url="$1"
  local dest="$2"
  if [[ ! -f "$dest" ]]; then
    curl --fail --silent --show-error --location "$url" --output "$dest"
  fi
}

download "https://kind.sigs.k8s.io/dl/v0.27.0/kind-windows-amd64" "$bin/kind.exe"
download "https://get.helm.sh/helm-v3.17.3-windows-amd64.zip" "$bin/helm.zip"
if [[ ! -f "$bin/helm.exe" ]]; then
  unzip -o "$bin/helm.zip" -d "$bin/helm-extract"
  mv "$bin/helm-extract/windows-amd64/helm.exe" "$bin/helm.exe"
fi
download "https://github.com/opentofu/opentofu/releases/download/v1.9.1/tofu_1.9.1_windows_amd64.zip" "$bin/tofu.zip"
if [[ ! -f "$bin/tofu.exe" ]]; then
  unzip -o "$bin/tofu.zip" -d "$bin/tofu-extract"
  mv "$bin/tofu-extract/tofu.exe" "$bin/tofu.exe"
fi

KIND="$bin/kind.exe"
HELM="$bin/helm.exe"
TOFU="$bin/tofu.exe"
KUBECTL="$(command -v kubectl)"
export HELM KUBECTL
cluster="curasphere-f04"
kubeconfig="$bin/curasphere-f04.kubeconfig"
export KUBECONFIG="$kubeconfig"
token_file="$bin/local.token"
printf 'local-sim-token' > "$token_file"
export CURASPHERE_TOKEN_FILE="$token_file"

echo "SIM-02 source hashes"
hash_sources() {
  openssl dgst -sha256 ai/gateway/app.py ai/gateway/Dockerfile ai/gateway/requirements.txt | openssl dgst -sha256
}
first="$(hash_sources)"
second="$(hash_sources)"
[[ "$first" == "$second" ]]
echo "source hash stable: $first"

echo "SIM-05 openssl tamper"
work="$bin/sign-work"
rm -rf "$work"
mkdir -p "$work"
cp packages/contracts/platform-contract.json "$work/artifact.json"
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out "$work/key.pem"
openssl pkey -in "$work/key.pem" -pubout -out "$work/pub.pem"
openssl dgst -sha256 -sign "$work/key.pem" -out "$work/artifact.sig" "$work/artifact.json"
openssl dgst -sha256 -verify "$work/pub.pem" -signature "$work/artifact.sig" "$work/artifact.json"
printf '\n' >> "$work/artifact.json"
if openssl dgst -sha256 -verify "$work/pub.pem" -signature "$work/artifact.sig" "$work/artifact.json"; then
  echo "tampered artifact was accepted" >&2
  exit 1
fi
echo "tampered artifact rejected"

echo "object storage put and read"
docker compose -f infra/local/compose.yaml exec -T minio mc alias set local http://127.0.0.1:9000 curasphere local-test-only
docker compose -f infra/local/compose.yaml exec -T minio mc mb --ignore-existing local/platform-check
printf 'synthetic-object' | docker compose -f infra/local/compose.yaml exec -T minio mc pipe local/platform-check/note.txt
stored="$(docker compose -f infra/local/compose.yaml exec -T minio mc cat local/platform-check/note.txt | tr -d '\r')"
[[ "$stored" == "synthetic-object" ]]
echo "object storage read back synthetic-object"

echo "tofu validate"
(cd infra/terraform/envs/dev && "$TOFU" init -backend=false && "$TOFU" validate && "$TOFU" apply -auto-approve -state="$bin/dev.tfstate" && "$TOFU" destroy -auto-approve -state="$bin/dev.tfstate")
if (cd infra/terraform/envs/production-rejected && "$TOFU" init -backend=false && "$TOFU" plan -state="$bin/prod.tfstate"); then
  echo "production plan was accepted" >&2
  exit 1
fi
echo "production plan rejected"

echo "build gateway image"
docker build --provenance=false -t curasphere-ai-gateway:good ai/gateway
docker image inspect curasphere-ai-gateway:good --format '{{.Id}}' | tee "$bin/image-id-1.txt"
docker build --provenance=false -t curasphere-ai-gateway:good ai/gateway
docker image inspect curasphere-ai-gateway:good --format '{{.Id}}' | tee "$bin/image-id-2.txt"
echo "image id first: $(cat "$bin/image-id-1.txt")"
echo "image id second: $(cat "$bin/image-id-2.txt")"

echo "SIM-08 create cluster"
"$KIND" delete cluster --name "$cluster" --kubeconfig "$kubeconfig" >/dev/null 2>&1 || true
"$KIND" create cluster --name "$cluster" --kubeconfig "$kubeconfig"
"$KIND" load docker-image curasphere-ai-gateway:good --name "$cluster"

echo "SIM-01 deploy"
bash infra/delivery/deploy.sh dev
"$KUBECTL" rollout status deployment/ai-gateway -n curasphere-dev --timeout=180s
"$KUBECTL" port-forward -n curasphere-dev svc/ai-gateway 18080:8000 >/tmp/curasphere-pf.txt 2>&1 &
pf_pid=$!
sleep 2
curl --fail --silent http://127.0.0.1:18080/health | tee "$bin/health.txt"
kill "$pf_pid" >/dev/null 2>&1 || true
grep -q '"clinicalGeneration":"refused"' "$bin/health.txt" || grep -q 'clinicalGeneration' "$bin/health.txt"

echo "SIM-03 failed rollout and rollback"
"$HELM" upgrade curasphere infra/helm/curasphere --namespace curasphere-dev -f infra/helm/curasphere/values-dev.yaml --set healthMode=fail
if "$KUBECTL" rollout status deployment/ai-gateway -n curasphere-dev --timeout=40s; then
  echo "invalid rollout became ready" >&2
  exit 1
fi
echo "invalid rollout did not become ready"
bash infra/delivery/rollback.sh dev
"$KUBECTL" port-forward -n curasphere-dev svc/ai-gateway 18081:8000 >/tmp/curasphere-pf2.txt 2>&1 &
pf_pid=$!
sleep 2
curl --fail --silent http://127.0.0.1:18081/health | tee "$bin/health-after-rollback.txt"
kill "$pf_pid" >/dev/null 2>&1 || true

echo "SIM-04 missing secret"
"$KUBECTL" -n curasphere-dev delete secret curasphere-dev-token
"$KUBECTL" -n curasphere-dev delete pod -l app=ai-gateway
sleep 5
"$KUBECTL" -n curasphere-dev describe pod -l app=ai-gateway > "$bin/missing-secret.txt" || true
if grep -q 'local-sim-token' "$bin/missing-secret.txt"; then
  echo "missing-secret output contained the token" >&2
  exit 1
fi
grep -E -q 'secret|CreateContainerConfigError|not found' "$bin/missing-secret.txt"
echo "missing secret failed closed"
CURASPHERE_TOKEN_FILE="$token_file" HELM="$HELM" KUBECTL="$KUBECTL" KUBECONFIG="$kubeconfig" bash infra/delivery/deploy.sh dev
"$KUBECTL" -n curasphere-dev delete pod -l app=ai-gateway
"$KUBECTL" rollout status deployment/ai-gateway -n curasphere-dev --timeout=180s

echo "SIM-06 dependency outage"
"$HELM" upgrade curasphere infra/helm/curasphere --namespace curasphere-dev -f infra/helm/curasphere/values-dev.yaml --set dependencyURL=http://127.0.0.1:9/health
if "$KUBECTL" rollout status deployment/ai-gateway -n curasphere-dev --timeout=40s; then
  echo "dependency outage became ready" >&2
  exit 1
fi
echo "dependency outage was not ready"
"$HELM" upgrade curasphere infra/helm/curasphere --namespace curasphere-dev -f infra/helm/curasphere/values-dev.yaml --set dependencyURL=
"$KUBECTL" rollout status deployment/ai-gateway -n curasphere-dev --timeout=180s
echo "dependency restored"

echo "SIM-07 render isolation"
"$HELM" template curasphere infra/helm/curasphere -f infra/helm/curasphere/values-dev.yaml > "$bin/dev.yaml"
"$HELM" template curasphere infra/helm/curasphere -f infra/helm/curasphere/values-staging.yaml > "$bin/staging.yaml"
grep -q 'namespace: curasphere-dev' "$bin/dev.yaml"
grep -q 'namespace: curasphere-staging' "$bin/staging.yaml"
if grep -q 'curasphere-staging-token' "$bin/dev.yaml"; then
  echo "dev render referenced the staging secret" >&2
  exit 1
fi
if "$HELM" template curasphere infra/helm/curasphere -f infra/helm/curasphere/values-production.yaml >"$bin/production.yaml"; then
  echo "production render was accepted" >&2
  exit 1
fi
echo "environment renders are isolated"

echo "SIM-08 recreate"
"$KIND" delete cluster --name "$cluster" --kubeconfig "$kubeconfig"
"$KIND" create cluster --name "$cluster" --kubeconfig "$kubeconfig"
"$KIND" load docker-image curasphere-ai-gateway:good --name "$cluster"
bash infra/delivery/deploy.sh dev
"$KUBECTL" rollout status deployment/ai-gateway -n curasphere-dev --timeout=180s
echo "recreated environment is ready"
echo "delivery simulations passed"
