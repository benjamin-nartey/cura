# ADR-0055: The gateway image moves to a pinned Debian 13 base

Status: Accepted
Date: 2026-10-13

## Context
Trivy 0.58.1, after refreshing `trivy-db:2`, reported two critical findings in `curasphere-ai-gateway:good` built from `python:3.12-slim-bookworm`. Both were Debian 12 packages from the base image, not the pip layer. Neither had a fixed version in that scan. `next@15.5.27` still depended on `postcss@8.4.31`. No 15.x release cleared that advisory. The working tree is now a Git repository whose remote `https://github.com/benjamin-nartey/cura.git` is empty. The stored `GITHUB_TOKEN` was rejected. Git credential fill authenticated as `benjamin-nartey` with admin permission.

## Decision
Rebuild the gateway from `python:3.12-slim-trixie@sha256:a6e34c598f2467ed0e9a8d349809fcd8b5c603269512df273a0bb1784edc11b1`. The same refreshed Trivy database reported zero critical findings for that base and for the rebuilt image. Set `@curasphere/web` to exact `next@16.4.0`, which depends on `postcss@8.5.23`. Sign a local blob with Cosign 3.1.3 and a key kept under gitignored `tools/bin/`. Do not upload that signature to the public transparency log. On the existing GitHub repository, activate ruleset `curasphere-default-branch` for the default branch: no deletion, no force push, one approving review, and the `verify` status check. The status check does not apply to the branch-creation push. Do not push this checkout.

## Consequences
The deployable image id is `sha256:b55f580c59e88345fd4bc878e8682f2d6b8db8bafcd89c5cf4a27ffb47bfe747`. `npm audit` reports zero vulnerabilities. Debian high findings and three Starlette high findings remain and are not critical. The private Cosign key is not in Git. No GitHub Actions run exists because the remote has no commits. Rollback of this image was executed on kind cluster `curasphere-f04`.

## Revisit trigger
Upgrade FastAPI only after a release that depends on Starlette at or above the fixed versions is tested. Push to `benjamin-nartey/cura` only with a separate authorization, then record the Actions run id. Do not treat the local Cosign key as production keyless provenance.
