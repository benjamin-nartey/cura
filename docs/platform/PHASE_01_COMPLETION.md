# Phase 01 completion report

Phase 01, Platform Repository and Developer Experience, is not accepted. All five features are ACCEPTED in the feature register. Two source exit criteria are unmet, so the phase status is BLOCKED. Phase 02 has not started.

## Features

| Feature | Register status | Evidence | What remains unsigned |
| --- | --- | --- | --- |
| P01-F01 Monorepo skeleton | ACCEPTED | Workspaces type-check. The AI scaffold refuses generation. | No security or clinical approval. |
| P01-F02 Local infrastructure | ACCEPTED | `bash infra/local/up.sh` printed `local stack smoke passed`. | Object storage is `pgsty/silo`, not upstream MinIO. |
| P01-F03 Contracts and code quality | ACCEPTED | An incompatible contract change fails the local check. CycloneDX 1.5 was generated. | The postcss finding through next is not cleared. GitHub Actions was not run. |
| P01-F04 Delivery and infra skeleton | ACCEPTED | `bash infra/delivery/simulate.sh` exit 0, including a failed rollout and `rollback.sh dev`. | Trivy reported 2 critical image findings. Cosign was not run. |
| P01-F05 Observability scaffolding | ACCEPTED | Trace `90df13d99c343fb8eb9db13146aa8583` was in the gateway log and the collector. The prompt and token were absent. | Grafana and Prometheus were not started. |

ACCEPTED means that feature's own checks passed. It does not mean a regulator, a security reviewer, or a clinical reviewer signed.

## Source exit criteria

- One-command local environment. Met. `bash infra/local/up.sh` on 2026-10-13 exit 0.
- Reproducible builds. Met locally. Two builds with `--provenance=false` produced `sha256:ded04cd7b09b1966863225bd8c34c8a1385789a5ee729fcb6e12fadde4803573`. This checkout has no commit SHA. GitHub Actions was not executed.
- Protected branches and required reviews. Not met. This folder is not a git repository, and no host branch-protection setting was read.
- No critical dependency vulnerabilities. Not met. `npm audit --audit-level=critical` exit 0 with 0 critical, 1 high, and 1 moderate. Trivy 0.58.1 reported 2 critical findings in the Debian packages of `curasphere-ai-gateway:good`, plus 53 high Debian findings and 3 high Python findings. `next@16.4.0` depends on `postcss@8.5.23` and was not installed. `next@15.5.27` still depends on `postcss@8.4.31`.

## Rollback that was exercised

On 2026-10-13 the dev rollout with `healthMode=fail` did not become ready. `bash infra/delivery/rollback.sh dev` printed `rolled back dev`. The following health body was `{"status":"ok","service":"ai-gateway","clinicalGeneration":"refused"}`.

## Approvals that are not claimed

- Security and privacy approval: not recorded.
- Clinical approval: not recorded.
- Architecture approval: not recorded.
- Authorization to start Phase 02: not recorded.
- Production deployment: refused by `deploy.sh` and by the OpenTofu production example.
- Regulatory classification: pending.
- GitHub Actions result: not observed.
- Cosign or keyless provenance: not produced.
- Branch protection: not verified.

The source specification document is not in this checkout. The phase specification's reproduction of the Phase 01 scope was used, and that gap remains recorded in ADR-0049.

Stopping here. Phase 02 needs a separate instruction.
