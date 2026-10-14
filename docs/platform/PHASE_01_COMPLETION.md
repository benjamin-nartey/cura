# Phase 01 completion report

Phase 01, Platform Repository and Developer Experience, is accepted. P01-F01 through P01-F05 stay ACCEPTED. The two exit criteria that blocked the phase were rechecked after remediation. Phase 02 has not started.

## Features

| Feature | Register status | Evidence | What remains unsigned |
| --- | --- | --- | --- |
| P01-F01 Monorepo skeleton | ACCEPTED | Workspaces type-check. The AI scaffold refuses generation. | No security or clinical approval. |
| P01-F02 Local infrastructure | ACCEPTED | Kafka stopped: smoke exit 1, `stack smoke failed: kafka`. Kafka restored: `local stack smoke passed`. | Object storage is `pgsty/silo`, not upstream MinIO. |
| P01-F03 Contracts and code quality | ACCEPTED | Contract, signing, and delivery tests passed. CycloneDX 1.5 serial `urn:uuid:f5718a7c-e178-41fe-801d-3ba16b7e7e5f` was written to gitignored `tools/bin/curasphere-sbom.cdx.json`. | No hosted Actions run. |
| P01-F04 Delivery and infra skeleton | ACCEPTED | The rebuilt image rolled forward, a failed health rollout timed out, and rollback restored `clinicalGeneration` `refused`. | Cosign used a local key, not keyless GitHub provenance. |
| P01-F05 Observability scaffolding | ACCEPTED | Trace `2307666be913e7cd5b5d2a08267117df` was in the gateway log and the collector. The prompt and token were absent. | Grafana was not started. The seed file was not loaded into a running Grafana. |

ACCEPTED means the feature and phase checks that were executed passed. It does not mean a regulator or a clinical reviewer signed.

## Critical image findings

Trivy 0.58.1 refreshed `mirror.gcr.io/aquasec/trivy-db:2` before the successful before-scan. An earlier scan of the same image timed out while that database downloaded and produced no findings. The successful before-scan, using the refreshed database, reported two critical Debian 12.15 packages in `curasphere-ai-gateway:good` at `sha256:ded04cd7b09b1966863225bd8c34c8a1385789a5ee729fcb6e12fadde4803573`:

| ID | Package | Installed | Fixed version | Status | Layer |
| --- | --- | --- | --- | --- | --- |
| CVE-2025-7458 | libsqlite3-0 | 3.40.1-2+deb12u2 | none | affected | Base image. SQLite integer overflow in `sqlite3KeyInfoFromExprList` for 3.39.2 through 3.41.1. |
| CVE-2023-45853 | zlib1g | 1:1.2.13.dfsg-1 | none | will_not_fix | Base image. MiniZip overflow. Debian marked it will-not-fix because MiniZip is not the supported zlib runtime. |

The pip layer had zero critical Python findings. No ignore file was added. `python:3.12-slim-trixie` digest `sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1` had zero critical findings on that same database, so the Dockerfile now pins that base and copies `observe.py`. The rebuilt image id is `sha256:b55f580c59e88345fd4bc878e8682f2d6b8db8bafcd89c5cf4a27ffb47bfe747`. A second build with `--provenance=false` produced the same id. Trivy on that image reported 0 critical, 44 Debian high, and 3 Python high.

The container answered `GET /health` with `clinicalGeneration` `refused`, answered `POST /v1/generate` with HTTP 403, served `curasphere_http_requests_total`, and stopped with exit code 0.

## Next.js and PostCSS

Installed before the upgrade: `next@15.5.27` and `postcss@8.4.31`. npm audit reported one high and one moderate, both through that chain. The high advisory is GHSA-qx2v-qp2m-jg93, GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, and GHSA-r28c-9q8g-f849, range `postcss <=8.5.22`. The latest `next@15` release is 15.5.27 and still depends on `postcss@8.4.31`. `next@16.4.0` depends on `postcss@8.5.23` and accepts the installed React 19.

`@curasphere/web` is now exact `next@16.4.0`. `npm run typecheck` exit 0. `npm run build --workspace @curasphere/web` exit 0. `npm audit` and `npm audit --audit-level=critical` both reported 0 vulnerabilities. No high or moderate npm finding remains.

## Git and reviews

This folder is a Git repository. `origin` is `https://github.com/benjamin-nartey/cura.git`. Local `main` is `b9e2c5f4b08162a19a749847f0239b5d3922a25a`. No upstream is configured. The remote is public, empty, and was last marked pushed at `2026-10-13T19:29:05Z`. The environment `GITHUB_TOKEN` returned HTTP 401. Git credential fill authenticated as `benjamin-nartey` with admin permission. This checkout was not pushed.

Ruleset `25029633`, name `curasphere-default-branch`, was created and read back:

- Enforcement: active
- Target: `~DEFAULT_BRANCH`
- Deletion: blocked
- Force push: blocked
- Pull request: 1 approving review, stale reviews dismissed, review threads must be resolved
- Status check: context `verify`, strict, not enforced on branch creation

Classic branch protection still returns `Branch not found` because `main` has no commits on GitHub. No GitHub Actions run id exists. Workflow permissions in `.github/workflows/ci.yml` are `contents: read`. That file was not executed on GitHub.

## Signing

Cosign `v3.1.3` signed `packages/contracts/platform-contract.json` with a key under gitignored `tools/bin/`. `verify-blob` printed `Verified OK`. After one newline was appended, verification exited 1 with `invalid signature`. The signature was not uploaded to the public transparency log. This is not keyless GitHub provenance. The private key is not in Git.

## Other checks executed on 2026-10-13

- `npm test` exit 0, 77 passed.
- `npm run constitution:phase00` exit 0, 19 passed.
- `node --test` for contract compatibility, signing, and delivery exit 0, 5 passed.
- Gateway `unittest` exit 0 after `pip install -r ai/gateway/requirements.txt`.
- OpenTofu dev `init` and `validate` succeeded. The production example plan failed with `production is not authorized`.
- `deploy.sh production` is rejected by the delivery test.
- Trivy secret scan of the checkout, skipping `tools/`, virtualenvs, `node_modules`, `.git`, `.next`, `data`, and `apps/mobile`, exit 0. No secret findings were printed. Earlier scans that walked `.venv` hit the 4 minute timeout and are not a clean result.
- `GET /metrics` on the running container included the request counter and did not include the token.

## Residual risk

Debian 13.7 still has 44 high findings in the gateway image. Starlette `0.41.3`, pulled by FastAPI `0.115.6`, has CVE-2025-62727 fixed in `0.49.1`, CVE-2026-48818 fixed in `1.1.0`, and CVE-2026-54283 fixed in `1.3.1`. Current FastAPI on PyPI is `0.143.0` and was not installed. Owner of that follow-up is the engineering role. No security approval was recorded.

Grafana and Prometheus processes were not started. The dashboard seed remains `infra/observability/grafana/ai-gateway.json`. The Phase 01 text asks for that seed. The acceptance evidence is the trace, which was observed.

## Approvals that are not claimed

- Security and privacy approval: not recorded.
- Clinical approval: not recorded.
- Architecture approval: not recorded.
- Authorization to start Phase 02: not recorded.
- Production deployment: still refused.
- Regulatory classification: pending.
- GitHub Actions result: not observed.
- A merged pull request with a human review: not observed. The ruleset requires one, and the remote has no branch yet.

The source specification document is not in this checkout. ADR-0049 still records that gap. The base-image and Next.js decisions are in ADR-0055.

Stopping here. Phase 02 needs a separate instruction.
