# ADR-0052: Platform routes have a compatibility check

Status: Accepted
Date: 2026-10-13

## Context
P01-F03 requires versioned API contracts, a check that rejects an incompatible change, lint and test entry points, a pre-commit check, an SBOM, and a dependency scan. Clinical TypeScript models already live in `@curasphere/contracts` and `@curasphere/domain`. `.github/workflows/ci.yml` already runs `npm ci`, `npm test`, and `npm run typecheck`.

## Decision
Add `packages/contracts/platform-contract.json` for the AI scaffold routes only. `tools/platform/contract-compat.mjs` generates `packages/contracts/src/platform.ts` and rejects a removed response field or a changed status. The existing CI workflow runs that test, `npm audit --audit-level=critical`, and `npm sbom --sbom-format cyclonedx`. `tools/platform/pre-commit.sh` runs the same contract test. This repository does not set `core.hooksPath`.

## Consequences
An incompatible edit of the platform contract fails the local check that CI runs. Root and web packages now have version `0.1.0` so CycloneDX can build a purl. Rollback is to remove the contract files, the checker, the pre-commit script, and the added CI steps. No database migration is involved.

## Revisit trigger
Add Kubernetes and Terraform only after this contract check stays green. Do not treat the high postcss finding as cleared.
