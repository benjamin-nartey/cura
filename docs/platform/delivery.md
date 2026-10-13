# Delivery skeleton

This runbook deploys the AI gateway scaffold to the disposable kind cluster `curasphere-f04`. It does not deploy production and it does not create paid cloud resources.

## Local tools

`infra/delivery/simulate.sh` downloads `kind` 0.27.0, Helm 3.17.3, and OpenTofu 1.9.1 into `tools/bin/` when they are missing. That directory is gitignored. The kubeconfig is `tools/bin/curasphere-f04.kubeconfig`.

## Deploy

Write a local token file outside the repository contents you commit. The simulation uses `tools/bin/local.token`. Then:

```bash
export HELM="$PWD/tools/bin/helm.exe"
export KUBECTL=kubectl
export KUBECONFIG="$PWD/tools/bin/curasphere-f04.kubeconfig"
export CURASPHERE_TOKEN_FILE="$PWD/tools/bin/local.token"
bash infra/delivery/deploy.sh dev
```

`deploy.sh staging` is the only other accepted environment. Any other argument, including `production`, exits 2 and prints `production deployment is not authorized`. The token is not printed. Helm stdout is checked and the command fails if the token appears there.

## Rollback

```bash
bash infra/delivery/rollback.sh dev
```

This runs `helm rollback` for the selected environment and waits for the deployment. Production is refused. A failed rollout that sets health to fail does not replace the last ready revision when `maxUnavailable` is 0. The simulation observed that timeout, then a rollback, then `GET /health` returned `clinicalGeneration` `refused`.

## Secret rotation and recovery

Development, staging, and production use different namespaces, secret names, and object-store bucket names. The chart does not render the token. Rotation is: write a new token file, run `deploy.sh` for that environment, and let it replace the secret and restart the pods. Recovery from a bad rollout is `rollback.sh` for the same environment. If the token file is missing or empty, deploy exits 2. If the workload secret is deleted, the pod stays unready and `kubectl describe` must not print the token. There is no committed production credential. Test tokens stay in `tools/bin/`, which is not part of the chart.

## Destroy the disposable cluster

```bash
tools/bin/kind.exe delete cluster --name curasphere-f04
```

OpenTofu state for the local module test is `tools/bin/dev.tfstate`. Do not pass `infra/terraform/backend.example.hcl` to `tofu init`.

## What was verified locally

`bash infra/delivery/simulate.sh` exit 0 on 2026-10-13. That script is the record for the clean deploy, the second image build, the failed rollout, the missing secret, the tampered signature, the dependency outage, the dev/staging split, and the cluster recreate. GitHub Actions was not executed. Branch protection was not checked. Cosign was not run.
