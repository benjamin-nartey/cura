# ADR-0053: Delivery stays on a disposable local cluster

Status: Accepted
Date: 2026-10-13

## Context
P01-F04 requires Helm, OpenTofu, secret injection, CI supply-chain checks, and a real rollback. This checkout is not a git repository. Helm, kind, and OpenTofu were not installed. `cosign` and a GitHub Actions run were not available. The object-storage service is already `pgsty/silo` under ADR-0051 because anonymous pulls of `minio/minio` failed.

## Decision
Deploy only the AI gateway scaffold to a kind cluster named `curasphere-f04`. Helm values contain no token. `infra/delivery/deploy.sh` accepts `dev` or `staging` and refuses every other name, including production. The token is applied from `CURASPHERE_TOKEN_FILE` after the Helm upgrade, and the upgrade log is rejected if it contains that token. OpenTofu modules tag a data-store name and refuse `environment=production`. They do not declare a cloud provider and are not applied to a remote backend. Artifact checks are an OpenSSL RSA-2048 signature in the local simulation, because this MinGW OpenSSL build rejects Ed25519, plus a Node `ed25519` test that CI can run. Container scanning uses Trivy `0.58.1` locally. `next` stays at `15.5.27`.

## Consequences
`bash infra/delivery/simulate.sh` is the local proof. It is not a production deployment and not a GitHub Actions result. Rollback is `bash infra/delivery/rollback.sh dev` after a failed rollout. Image digests match only when BuildKit provenance is disabled. The Trivy scan of `curasphere-ai-gateway:good` reported Debian 12.15 totals of 55 (53 high, 2 critical) and Python package totals of 3 high. `npm audit --audit-level=critical` still exits 0 with 1 high and 1 moderate in `postcss@8.4.31` through `next@15.5.27`. `next@16.4.0` depends on `postcss@8.5.23`, which is outside the advisory range `<=8.5.22`, and that major upgrade was not applied. Risk owner for the residual findings is the engineering role. No security approval was recorded.

## Revisit trigger
Adopt `next@16` only after the web workspace type-check and tests pass. Treat the image critical findings as closed only after a newer base image is scanned and the critical count is zero. Do not apply a remote OpenTofu backend or deploy production without a separate authorization.
